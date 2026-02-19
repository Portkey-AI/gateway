import { ServerTransport } from '../types/mcp.js';
import { createLogger } from '../../shared/utils/logger.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { RequestId } from '@modelcontextprotocol/sdk/types.js';

/**
 * Downstream transport handler for client connections.
 * Only supports HTTP Streamable transport (SSE downstream was removed).
 */
export class Downstream {
  public connected: boolean = false;
  public transport?: ServerTransport;

  private logger;
  private onMessageHandler: (message: any, extra: any) => Promise<void>;

  constructor(options: {
    sessionId: string; // Kept for API compatibility, but no longer used
    onMessageHandler: (message: any, extra: any) => Promise<void>;
  }) {
    this.logger = createLogger(`Downstream`);
    this.onMessageHandler = options.onMessageHandler;
  }

  /**
   * Create the downstream HTTP transport
   */
  create(): ServerTransport {
    this.logger.debug('Creating HTTP downstream transport');

    this.transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

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

  /**
   * Handle incoming HTTP request
   */
  handleRequest(req: any, res: any, body?: any) {
    if (!this.connected) {
      throw new Error('Downstream not connected');
    }
    return (this.transport as StreamableHTTPServerTransport).handleRequest(
      req,
      res,
      body
    );
  }

  async close() {
    if (!this.connected) {
      this.logger.debug('Downstream already disconnected, skipping close');
      return;
    }
    this.connected = false;
    await this.transport?.close();
    this.transport = undefined;
  }
}
