/**
 * @file MockMCPServer.ts
 * Minimal mock MCP server for testing gateway-specific behavior
 *
 * Use this for:
 * - Verifying headers forwarded by the gateway
 * - Simulating upstream errors and delays
 * - Testing specific edge cases
 *
 * For general protocol compliance testing, use EverythingServer instead.
 */

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';

export interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: any;
  timestamp: number;
}

export interface MockServerOptions {
  port?: number;
  /** Delay in ms before responding */
  responseDelay?: number;
}

export class MockMCPServer {
  private server: Server | null = null;
  private port: number;
  private responseDelay: number;

  /** Configurable error responses per method */
  private errorForMethods: Record<string, { code: number; message: string }> =
    {};

  /** Configurable tools list */
  private tools: Array<{ name: string; description: string; inputSchema: any }>;

  /** All recorded requests - inspect these in tests */
  public requests: RecordedRequest[] = [];

  public isRunning = false;

  constructor(options: MockServerOptions = {}) {
    this.port = options.port ?? 0; // 0 = random available port
    this.responseDelay = options.responseDelay ?? 0;
    this.tools = [
      {
        name: 'echo',
        description: 'Echoes back the input message',
        inputSchema: {
          type: 'object',
          properties: { message: { type: 'string' } },
          required: ['message'],
        },
      },
      {
        name: 'get_headers',
        description: 'Returns headers received by the server',
        inputSchema: { type: 'object', properties: {} },
      },
    ];
  }

  /**
   * Start the mock server
   * @returns The URL of the running server
   */
  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = createServer(this.handleRequest.bind(this));

      this.server.on('error', reject);

      this.server.listen(this.port, '127.0.0.1', () => {
        const address = this.server!.address();
        if (typeof address === 'object' && address) {
          this.port = address.port;
          this.isRunning = true;
          resolve(`http://127.0.0.1:${this.port}/mcp`);
        } else {
          reject(new Error('Failed to get server address'));
        }
      });
    });
  }

  /**
   * Stop the mock server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          this.isRunning = false;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /** Clear recorded requests */
  clearRequests(): void {
    this.requests = [];
  }

  /** Get the last recorded request */
  getLastRequest(): RecordedRequest | undefined {
    return this.requests[this.requests.length - 1];
  }

  /** Get requests by MCP method */
  getRequestsByMethod(method: string): RecordedRequest[] {
    return this.requests.filter((r) => r.body?.method === method);
  }

  /** Set response delay in ms */
  setResponseDelay(delayMs: number): void {
    this.responseDelay = delayMs;
  }

  /** Configure error for a specific MCP method */
  setErrorForMethod(
    method: string,
    error: { code: number; message: string } | null
  ): void {
    if (error) {
      this.errorForMethods[method] = error;
    } else {
      delete this.errorForMethods[method];
    }
  }

  /** Set the tools to return */
  setTools(
    tools: Array<{ name: string; description: string; inputSchema: any }>
  ): void {
    this.tools = tools;
  }

  /** Get the server URL */
  getUrl(): string {
    return `http://127.0.0.1:${this.port}/mcp`;
  }

  /** Get the server port */
  getPort(): number {
    return this.port;
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    // Collect body
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const bodyText = Buffer.concat(chunks).toString('utf-8');

    let body: any = null;
    try {
      if (bodyText) body = JSON.parse(bodyText);
    } catch {
      /* not JSON */
    }

    // Record request
    this.requests.push({
      method: req.method ?? 'GET',
      url: req.url ?? '/',
      headers: { ...req.headers },
      body,
      timestamp: Date.now(),
    });

    // Apply delay
    if (this.responseDelay > 0) {
      await new Promise((r) => setTimeout(r, this.responseDelay));
    }

    // Route
    if (req.url === '/mcp') {
      await this.handleMCP(body, res);
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    }
  }

  private async handleMCP(body: any, res: ServerResponse): Promise<void> {
    const id = body?.id ?? null;
    const method = body?.method;
    const params = body?.params ?? {};

    // Check for configured errors
    if (method && this.errorForMethods[method]) {
      const err = this.errorForMethods[method];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: err.code, message: err.message },
          id,
        })
      );
      return;
    }

    let result: any;

    switch (method) {
      case 'initialize':
        result = {
          protocolVersion: params.protocolVersion ?? '2024-11-05',
          capabilities: { tools: {}, prompts: {}, resources: {} },
          serverInfo: { name: 'mock-mcp-server', version: '1.0.0' },
        };
        break;

      case 'tools/list':
        result = { tools: this.tools };
        break;

      case 'tools/call':
        result = this.handleToolCall(params);
        break;

      case 'ping':
        result = {};
        break;

      default:
        result = {};
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', result, id }));
  }

  private handleToolCall(params: {
    name: string;
    arguments?: Record<string, unknown>;
  }): any {
    const { name, arguments: args = {} } = params;

    if (name === 'echo') {
      return {
        content: [
          { type: 'text', text: `Echo: ${(args as any).message ?? ''}` },
        ],
      };
    }

    if (name === 'get_headers') {
      const lastReq = this.getLastRequest();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(lastReq?.headers ?? {}, null, 2),
          },
        ],
      };
    }

    return {
      isError: true,
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    };
  }
}
