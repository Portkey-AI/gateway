/**
 * @file TestClient.ts
 * MCP client wrapper for E2E testing
 *
 * Provides a simple interface to interact with the MCP gateway as a client would,
 * using the official MCP SDK with additional test utilities.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Tool, InitializeResult } from '@modelcontextprotocol/sdk/types.js';

export interface TestClientOptions {
  /** Gateway base URL (e.g., http://localhost:3000) */
  gatewayUrl: string;
  /** Workspace ID for the MCP endpoint */
  workspaceId?: string;
  /** Server ID for the MCP endpoint */
  serverId?: string;
  /** API key for authentication */
  apiKey?: string;
  /** OAuth token for authentication (alias for authToken) */
  oauthToken?: string;
  /** OAuth token for authentication */
  authToken?: string;
  /** Additional headers to send */
  headers?: Record<string, string>;
  /** Client name */
  clientName?: string;
}

export interface RequestResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  /** Raw response for debugging */
  raw?: any;
}

/** Tool call result with content */
export interface ToolCallResult {
  content: Array<{ type: string; text?: string; [key: string]: any }>;
  isError?: boolean;
  [key: string]: any;
}

export class TestClient {
  private client: Client;
  private transport: StreamableHTTPClientTransport | null = null;
  private options: TestClientOptions;
  private connected = false;

  /** Server capabilities after initialization */
  public serverCapabilities?: any;

  /** Server info after initialization */
  public serverInfo?: { name: string; version: string };

  constructor(options: TestClientOptions) {
    this.options = options;
    // Cast to any to avoid strict SDK type checking - the SDK accepts these capabilities at runtime
    this.client = new Client(
      {
        name: options.clientName ?? 'mcp-test-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      } as any
    );
  }

  /**
   * Connect to the gateway and initialize the MCP session
   */
  async connect(): Promise<RequestResult<InitializeResult>> {
    try {
      // Build the full URL
      let urlString = this.options.gatewayUrl;
      if (this.options.workspaceId && this.options.serverId) {
        // Construct: gatewayUrl/workspaceId/serverId/mcp
        urlString = `${this.options.gatewayUrl}/${this.options.workspaceId}/${this.options.serverId}/mcp`;
      }
      const url = new URL(urlString);

      const headers: Record<string, string> = {
        ...this.options.headers,
      };

      // Add authentication (support both oauthToken and authToken)
      const token = this.options.oauthToken || this.options.authToken;
      if (this.options.apiKey) {
        headers['x-portkey-api-key'] = this.options.apiKey;
      } else if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      this.transport = new StreamableHTTPClientTransport(url, {
        requestInit: { headers },
      });

      await this.client.connect(this.transport);
      this.connected = true;

      this.serverCapabilities = this.client.getServerCapabilities();
      this.serverInfo = this.client.getServerVersion();

      return {
        success: true,
        data: {
          protocolVersion: '2024-11-05',
          capabilities: this.serverCapabilities,
          serverInfo: this.serverInfo!,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: -32000,
          message: error.message ?? 'Connection failed',
          data: error,
        },
      };
    }
  }

  /**
   * Disconnect from the gateway
   */
  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.close();
      this.connected = false;
      this.transport = null;
    }
  }

  /**
   * List available tools
   */
  async listTools(): Promise<RequestResult<{ tools: Tool[] }>> {
    if (!this.connected) {
      return {
        success: false,
        error: { code: -32000, message: 'Not connected' },
      };
    }

    try {
      const result = await this.client.listTools();
      return {
        success: true,
        data: result as { tools: Tool[] },
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: error.code ?? -32000,
          message: error.message ?? 'Failed to list tools',
        },
      };
    }
  }

  /**
   * Call a tool
   */
  async callTool(
    name: string,
    args?: Record<string, unknown>
  ): Promise<RequestResult<ToolCallResult>> {
    if (!this.connected) {
      return {
        success: false,
        error: { code: -32000, message: 'Not connected' },
      };
    }

    try {
      const result = await this.client.callTool({ name, arguments: args });
      return {
        success: true,
        data: result as unknown as ToolCallResult,
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: error.code ?? -32000,
          message: error.message ?? 'Tool call failed',
        },
      };
    }
  }

  /**
   * Ping the server
   */
  async ping(): Promise<RequestResult<void>> {
    if (!this.connected) {
      return {
        success: false,
        error: { code: -32000, message: 'Not connected' },
      };
    }

    try {
      await this.client.ping();
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: error.code ?? -32000,
          message: error.message ?? 'Ping failed',
        },
      };
    }
  }

  /**
   * List prompts
   */
  async listPrompts(): Promise<RequestResult<any>> {
    if (!this.connected) {
      return {
        success: false,
        error: { code: -32000, message: 'Not connected' },
      };
    }

    try {
      const result = await this.client.listPrompts();
      return { success: true, data: result };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: error.code ?? -32000,
          message: error.message ?? 'Failed to list prompts',
        },
      };
    }
  }

  /**
   * List resources
   */
  async listResources(): Promise<RequestResult<any>> {
    if (!this.connected) {
      return {
        success: false,
        error: { code: -32000, message: 'Not connected' },
      };
    }

    try {
      const result = await this.client.listResources();
      return { success: true, data: result };
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: error.code ?? -32000,
          message: error.message ?? 'Failed to list resources',
        },
      };
    }
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.connected;
  }
}

/**
 * Create a test client with common defaults
 */
export function createTestClient(
  gatewayUrl: string,
  auth?: { apiKey?: string; oauthToken?: string }
): TestClient {
  return new TestClient({
    gatewayUrl,
    apiKey: auth?.apiKey,
    oauthToken: auth?.oauthToken,
  });
}
