import {
  ClientTransport,
  ConnectionTypes,
  ServerConfig,
  TransportTypes,
} from '../../types/mcp';
import { createLogger } from '../../utils/logger';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Tool } from '@modelcontextprotocol/sdk/types';
import { GatewayOAuthProvider } from './upstreamOAuth';
import { ControlPlane } from '../../middlewares/controlPlane';

type ClientTransportTypes =
  | typeof StreamableHTTPClientTransport
  | typeof SSEClientTransport;

export type ConnectResult =
  | { ok: true; type: TransportTypes; sessionId?: string }
  | {
      ok: false;
      needsAuth: true;
      serverId: string;
      workspaceId: string;
      authorizationUrl?: string;
    }
  | { ok: false; error: Error };

export const ConnectionTypesToTransportType: Record<
  ConnectionTypes,
  { primary: ClientTransportTypes; secondary?: ClientTransportTypes }
> = {
  'http-sse': {
    primary: StreamableHTTPClientTransport,
    secondary: SSEClientTransport,
  },
  'sse-http': {
    primary: SSEClientTransport,
    secondary: StreamableHTTPClientTransport,
  },
  http: { primary: StreamableHTTPClientTransport },
  sse: { primary: SSEClientTransport },
} as const;

export class Upstream {
  public readonly client?: Client;
  public connected: boolean = false;
  public availableTools?: Tool[];
  public serverCapabilities?: any;
  public pendingAuthURL?: string;

  constructor(
    private serverConfig: ServerConfig,
    private userId: string,
    private logger = createLogger('UpstreamConnector'),
    private upstreamSessionId?: string,
    private controlPlane?: ControlPlane
  ) {
    // TODO: Might need to advertise capabilities
    this.client = new Client({
      name: `portkey-${this.serverConfig.serverId}-client`,
      version: '1.0.0',
      title: 'Portkey MCP Gateway',
    });
  }

  private getTransportOptions() {
    let options: any = {};
    switch (this.serverConfig.auth_type) {
      case 'oauth_auto':
        this.logger.debug('Using OAuth auto-discovery for authentication');
        options = {
          authProvider: new GatewayOAuthProvider(
            this.serverConfig,
            this.userId,
            this.controlPlane
          ),
        };
        break;

      case 'oauth_client_credentials':
        // TODO: Implement client credentials flow
        this.logger.warn(
          'oauth_client_credentials not yet implemented, falling back to headers'
        );
        options = {
          requestInit: {
            headers: this.serverConfig.headers,
          },
        };
        break;
      case 'headers':
      default:
        options = {
          requestInit: {
            headers: this.serverConfig.headers,
          },
        };
        break;
    }
    if (this.upstreamSessionId) {
      options.sessionId = this.upstreamSessionId;
    }
    return options;
  }

  private makeTransport(transportType: ClientTransportTypes): ClientTransport {
    const upstreamUrl = new URL(this.serverConfig.url);
    return new transportType(upstreamUrl, this.getTransportOptions() as any);
  }

  private async connectOne(
    transportType: ClientTransportTypes
  ): Promise<ConnectResult> {
    try {
      const transport = this.makeTransport(transportType);
      await this.client!.connect(transport);
      this.upstreamSessionId = (transport as any).sessionId || undefined;

      this.connected = true;

      // TODO: do we need to fetch capabilities here?
      await this.fetchCapabilities();

      return {
        ok: true,
        sessionId: this.upstreamSessionId,
        type: 'streamable-http',
      };
    } catch (e: any) {
      if (e?.needsAuthorization) {
        this.pendingAuthURL = e.authorizationUrl;
        return {
          ok: false,
          needsAuth: true,
          serverId: this.serverConfig.serverId,
          workspaceId: this.serverConfig.workspaceId,
          authorizationUrl: this.pendingAuthURL,
        };
      }
      throw e;
    }
  }

  async connect(): Promise<ConnectResult> {
    // By default, try both transports
    let transportsToTry: {
      primary: typeof StreamableHTTPClientTransport | typeof SSEClientTransport;
      secondary?:
        | typeof StreamableHTTPClientTransport
        | typeof SSEClientTransport;
    } = ConnectionTypesToTransportType['http-sse'];

    if (this.serverConfig.type)
      transportsToTry = ConnectionTypesToTransportType[this.serverConfig.type];

    // First try the primary transport
    try {
      return this.connectOne(transportsToTry.primary);
    } catch (e: any) {
      // If the primary transport failed, try the secondary transport
      if (transportsToTry.secondary) {
        this.logger.debug('Primary transport failed, trying secondary', e);
        try {
          return this.connectOne(transportsToTry.secondary);
        } catch (e2: any) {
          this.logger.error('Secondary transport failed', e2);
          throw e2;
        }
      }
      throw e;
    }
  }

  /**
   * Fetch upstream capabilities
   */
  async fetchCapabilities(): Promise<void> {
    try {
      this.logger.debug('Fetching upstream capabilities');
      const toolsResult = await this.client!.listTools();
      this.availableTools = toolsResult.tools;

      // Get server capabilities from the client
      this.serverCapabilities = this.client!.getServerCapabilities();
      this.logger.debug(`Found ${this.availableTools?.length} tools`);
    } catch (error) {
      this.logger.error('Failed to fetch upstream capabilities', error);
    }
  }

  get transport(): ClientTransport {
    return this.client?.transport as ClientTransport;
  }

  /**
   * Send a message to upstream
   */
  async send(message: any): Promise<void> {
    if (!this.transport) {
      throw new Error('No upstream transport available');
    }
    await this.transport.send(message);
  }

  /**
   * Send a notification to upstream
   */
  async notification(message: any): Promise<void> {
    if (!this.client) {
      throw new Error('No upstream client available');
    }
    await this.client.notification(message);
  }

  /**
   * Forward a request to upstream
   */
  async request(request: any, schema?: any): Promise<any> {
    if (!this.client) {
      throw new Error('No upstream client available');
    }
    return this.client.request(request, schema || {});
  }

  /**
   * Call a tool on upstream
   */
  async callTool(params: any): Promise<any> {
    if (!this.client) {
      throw new Error('No upstream client available');
    }
    return this.client.callTool(params);
  }

  /**
   * List tools from upstream
   */
  async listTools(): Promise<any> {
    if (!this.client) {
      throw new Error('No upstream client available');
    }
    return this.client.listTools();
  }

  async ping(): Promise<any> {
    if (!this.client) {
      throw new Error('No upstream client available');
    }
    return this.client.ping();
  }

  async complete(params: any): Promise<any> {
    if (!this.client) {
      throw new Error('No upstream client available');
    }
    return this.client.complete(params);
  }

  async setLoggingLevel(params: any): Promise<any> {
    if (!this.client) {
      throw new Error('No upstream client available');
    }
    return this.client.setLoggingLevel(params.level);
  }

  async getPrompt(params: any): Promise<any> {
    if (!this.client) {
      throw new Error('No upstream client available');
    }
    return this.client.getPrompt(params);
  }

  async listPrompts(params: any): Promise<any> {
    if (!this.client) {
      throw new Error('No upstream client available');
    }
    return this.client.listPrompts(params);
  }

  async listResources(params: any): Promise<any> {
    if (!this.client) {
      throw new Error('No upstream client available');
    }
    return this.client.listResources(params);
  }

  async listResourceTemplates(params: any): Promise<any> {
    if (!this.client) {
      throw new Error('No upstream client available');
    }
    return this.client.listResourceTemplates(params);
  }

  async readResource(params: any): Promise<any> {
    if (!this.client) {
      throw new Error('No upstream client available');
    }
    return this.client.readResource(params);
  }

  async subscribeResource(params: any): Promise<any> {
    if (!this.client) {
      throw new Error('No upstream client available');
    }
    return this.client.subscribeResource(params);
  }

  async unsubscribeResource(params: any): Promise<any> {
    if (!this.client) {
      throw new Error('No upstream client available');
    }
    return this.client.unsubscribeResource(params);
  }

  /**
   * Close the upstream connection
   */
  async close(): Promise<void> {
    await this.client?.close();
  }

  isKnownRequest(method: string): boolean {
    return [
      'ping',
      'completion/complete',
      'logging/setLevel',
      'prompts/get',
      'prompts/list',
      'resources/list',
      'resources/templates/list',
      'resources/read',
      'resources/subscribe',
      'resources/unsubscribe',
    ].includes(method);
  }
}
