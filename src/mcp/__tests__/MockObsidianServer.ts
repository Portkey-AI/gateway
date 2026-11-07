/**
 * @file MockObsidianServer.ts
 * Mock of Obsidian's Unified Evaluation endpoint, for testing the gateway's
 * policy integration without an Obsidian tenant.
 *
 * It enforces the documented request rules (bearer token, required fields,
 * tool_response required on PostToolUse) and chooses a verdict from the tool
 * name so tests can drive each case:
 *
 *   tool_name prefix   behaviour
 *   ----------------   --------------------------------------------------
 *   blocked_           decision "block" with a message
 *   warn_              decision "warn"
 *   noeval_            decision "pass" but NO evaluation_id (not evaluated)
 *   weird_             decision "something_else" (must be treated as block)
 *   slow_              responds after `slowMs`
 *   error_             HTTP 500
 *   badjson_           HTTP 200 with a body that is not JSON
 *   (anything else)    decision "pass"
 *
 * On PostToolUse, a tool_response containing the text "SECRET" is blocked.
 */

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';

export interface RecordedObsidianRequest {
  headers: Record<string, string | string[] | undefined>;
  body: any;
}

export interface MockObsidianOptions {
  /** Bearer token the mock accepts. Default: "test-gateway-token". */
  token?: string;
  /** Delay for slow_ tools, in ms. Default: 500. */
  slowMs?: number;
  /** If set, every request fails with this HTTP status (outage simulation). */
  forceStatus?: number;
}

const REQUIRED_FIELDS = [
  'version',
  'event_id',
  'timestamp',
  'client_platform',
  'stage',
  'session_id',
  'target_service',
  'action_param',
];

export class MockObsidianServer {
  private server: Server | null = null;
  private url = '';
  readonly token: string;
  slowMs: number;
  forceStatus?: number;
  requests: RecordedObsidianRequest[] = [];
  private timers = new Set<NodeJS.Timeout>();

  constructor(options: MockObsidianOptions = {}) {
    this.token = options.token ?? 'test-gateway-token';
    this.slowMs = options.slowMs ?? 500;
    this.forceStatus = options.forceStatus;
  }

  async start(): Promise<string> {
    this.server = createServer((req, res) => {
      this.handle(req, res).catch(() => {
        res.writeHead(500).end();
      });
    });
    await new Promise<void>((resolve) =>
      this.server!.listen(0, '127.0.0.1', resolve)
    );
    const address = this.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    this.url = `http://127.0.0.1:${port}/webhook/unified/v1/enforcement`;
    return this.url;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    // Drop pending slow_ responses and keep-alive sockets so stop() is prompt.
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  getUrl(): string {
    return this.url;
  }

  reset(): void {
    this.requests = [];
  }

  private json(res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');

    let body: any;
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch {
      return this.json(res, 400, { error: 'invalid_request' });
    }
    this.requests.push({ headers: req.headers, body });

    if (this.forceStatus) {
      return this.json(res, this.forceStatus, { error: 'forced' });
    }
    if (req.method !== 'POST') return this.json(res, 405, {});
    if (req.headers.authorization !== `Bearer ${this.token}`) {
      return this.json(res, 401, { error: 'unauthorized' });
    }

    for (const field of REQUIRED_FIELDS) {
      if (body?.[field] === undefined) {
        return this.json(res, 400, {
          error: 'invalid_request',
          message: `${field} is required`,
        });
      }
    }

    const tool: string = body.action_param?.tool_name ?? '';
    const stage: string = body.stage;

    if (stage === 'PostToolUse') {
      const tr = body.action_param?.tool_response;
      if (tr === undefined || tr === null || tr === '') {
        return this.json(res, 400, {
          error: 'invalid_request',
          message: 'action_param.tool_response is required for PostToolUse',
        });
      }
    }

    const base = {
      version: '1.0',
      event_id: body.event_id,
      evaluation_id: `eval-${this.requests.length}`,
    };

    if (tool.startsWith('error_')) return this.json(res, 500, {});
    if (tool.startsWith('badjson_')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end('not json {');
    }
    if (tool.startsWith('slow_')) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          this.timers.delete(timer);
          resolve();
        }, this.slowMs);
        this.timers.add(timer);
      });
    }

    if (tool.startsWith('blocked_')) {
      return this.json(res, 200, {
        ...base,
        decision: 'block',
        matched_policies: [
          { id: 'policy-1', name: 'Block test tools', action: 'block' },
        ],
        message: 'Tool blocked by test policy',
      });
    }
    if (tool.startsWith('warn_')) {
      return this.json(res, 200, {
        ...base,
        decision: 'warn',
        matched_policies: [
          { id: 'policy-2', name: 'Flag test tools', action: 'warn' },
        ],
        message: 'Flagged by test policy',
      });
    }
    if (tool.startsWith('noeval_')) {
      return this.json(res, 200, {
        version: '1.0',
        event_id: body.event_id,
        decision: 'pass',
        matched_policies: [],
        message: 'No policy set for this organization',
      });
    }
    if (tool.startsWith('weird_')) {
      return this.json(res, 200, {
        ...base,
        decision: 'something_else',
        matched_policies: [],
      });
    }

    if (
      stage === 'PostToolUse' &&
      JSON.stringify(body.action_param.tool_response).includes('SECRET')
    ) {
      return this.json(res, 200, {
        ...base,
        decision: 'block',
        matched_policies: [
          { id: 'policy-3', name: 'Block secrets in output', action: 'block' },
        ],
        message: 'Sensitive data in tool output',
      });
    }

    return this.json(res, 200, {
      ...base,
      decision: 'pass',
      matched_policies: [],
    });
  }
}
