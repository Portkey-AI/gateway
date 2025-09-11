import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { ServerTransport, TransportTypes } from '../../types/mcp.js';
import { createLogger } from '../../utils/logger';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { RequestId } from '@modelcontextprotocol/sdk/types.js';

export class Downstream {
  public connected: boolean = false;
  public transport?: ServerTransport;

  private sessionId: string;
  private logger;
  private onMessageHandler: (message: any, extra: any) => Promise<void>;

  private type: TransportTypes;

  constructor(options: {
    sessionId: string;
    onMessageHandler: (message: any, extra: any) => Promise<void>;
  }) {
    this.sessionId = options.sessionId; // Only used in SSE transport
    this.logger = createLogger(`Downstream`);
    this.onMessageHandler = options.onMessageHandler;
    this.type = 'http'; // to begin with
  }

  create(type: TransportTypes): ServerTransport {
    this.type = type;
    this.logger.debug(`Creating ${this.type} downstream transport`);

    if (this.type === 'sse') {
      this.transport = new SSEServerTransport(
        `/messages?sessionId=${this.sessionId || crypto.randomUUID()}`,
        null as any
      );
    } else if (this.type === 'http') {
      this.transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
    } else {
      throw new Error('Invalid transport type');
    }

    this.transport.onmessage = this.onMessageHandler.bind(this);

    this.connected = true;

    return this.transport;
  }

  sendResult(id: RequestId, result: any) {
    if (!this.connected) {
      throw new Error('Downstream not connected');
    }
    return this.transport!.send({
      jsonrpc: '2.0',
      id,
      result,
    });
  }

  sendError(id: RequestId, code: number, message: string, data?: any) {
    if (!this.connected) {
      throw new Error('Downstream not connected');
    }
    return this.transport!.send({
      jsonrpc: '2.0',
      id,
      error: { code, message, data },
    });
  }

  sendAuthError(id: RequestId, data: any) {
    if (!this.connected) {
      throw new Error('Downstream not connected');
    }
    return this.transport!.send({
      jsonrpc: '2.0',
      id,
      error: {
        code: -32000,
        message: 'Authorization required',
        data,
      },
    });
  }

  handleRequest(req: any, res: any, body?: any) {
    if (!this.connected) {
      throw new Error('Downstream not connected');
    }
    if (this.type === 'sse' && req.method === 'POST' && body) {
      return (this.transport as SSEServerTransport).handlePostMessage(
        req,
        res,
        body
      );
    } else if (this.type === 'http') {
      return (this.transport as StreamableHTTPServerTransport).handleRequest(
        req,
        res,
        body
      );
    } else if (req.method === 'GET') {
      res.writeHead(400).end('Invalid path.');
      return;
    } else {
      res.writeHead(405).end('Method not allowed');
      return;
    }
  }

  async close() {
    if (!this.connected) {
      throw new Error('Downstream not connected');
    }
    this.connected = false;
    await this.transport?.close();
    this.transport = undefined;
  }
}
