import {
  ClientTransport,
  ConnectionTypes,
  ServerConfig,
  TransportTypes,
} from '../types/mcp';
import { createLogger } from '../../shared/utils/logger';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  CompleteRequestSchema,
  CreateMessageRequestSchema,
  ElicitRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { GatewayOAuthProvider } from './upstreamOAuth';
import { ControlPlane } from '../middleware/controlPlane';
import { Readable } from 'stream';
import { externalServiceFetchWithNodeFetch } from '../../utils/fetch';
import { extractHeadersToForward } from '../utils/headers';
import { buildUserIdentityHeaders, TokenInfo } from '../utils/userIdentity';

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
  public serverInfo?: {
    name: string;
    version: string;
    title?: string;
    description?: string;
    icons?: any[];
    websiteUrl?: string;
  };
  public instructions?: string;
  public pendingAuthURL?: string;
  public authProvider?: GatewayOAuthProvider;

  /**
   * Dynamic headers that are merged into each request.
   * Used for per-request headers (trace IDs, etc.) on pooled connections.
   */
  private dynamicHeaders: Record<string, string> = {};

  constructor(
    private serverConfig: ServerConfig,
    private userId: string,
    private logger = createLogger('UpstreamConnector'),
    private upstreamSessionId?: string,
    private controlPlane?: ControlPlane,
    private incomingRequestHeaders?: Record<string, string>,
    private tokenInfo?: TokenInfo,
    private incomingBaseUrl?: string
  ) {
    // TODO: Might need to advertise capabilities
    this.client = new Client(
      {
        name: `portkey-${this.serverConfig.serverId}-client`,
        version: '1.0.0',
        title: 'Portkey MCP Gateway',
      },
      {
        capabilities: {
          sampling: {
            context: {}, // Support context inclusion in sampling
            tools: {}, // Support tool use in sampling
          },
          elicitation: {
            form: {}, // Support form-based elicitation
            url: {}, // Support URL-based elicitation
          },
          roots: {
            listChanged: false, // Don't need notifications for root changes
          },
          experimental: {}, // Support experimental features
        },
      }
    );
  }

  private async getTransportOptions() {
    let options: any = {};

    // SECURITY: Extract and add forwarded headers from client request FIRST
    // This ensures they cannot override critical authentication headers
    // set in serverConfig.headers or serverConfig.passthroughHeaders
    if (this.serverConfig.forwardHeaders && this.incomingRequestHeaders) {
      const forwardedHeaders = extractHeadersToForward(
        this.incomingRequestHeaders,
        this.serverConfig.forwardHeaders
      );

      if (forwardedHeaders) {
        if (!options.requestInit) {
          options.requestInit = {};
        }
        if (!options.requestInit.headers) {
          options.requestInit.headers = {};
        }
        options.requestInit.headers = forwardedHeaders;
        this.logger.debug(
          `Forwarding ${Object.keys(forwardedHeaders).length} headers to upstream`
        );
      }
    }

    // Apply authentication and static headers (these take precedence over forwarded headers)
    switch (this.serverConfig.auth_type) {
      case 'oauth_auto':
        this.logger.debug('Using OAuth auto-discovery for authentication');
        if (!this.authProvider) {
          this.authProvider = new GatewayOAuthProvider(
            this.serverConfig,
            this.userId,
            this.controlPlane,
            undefined, // stateKey
            undefined, // resumeStateKey
            false, // isExternalAuth
            this.incomingBaseUrl
          );
        }
        options.authProvider = this.authProvider;
        break;

      case 'oauth_client_credentials':
        // TODO: Implement client credentials flow
        this.logger.warn(
          'oauth_client_credentials not yet implemented, falling back to headers'
        );
        // Merge with existing headers (from forwardHeaders)
        if (!options.requestInit) {
          options.requestInit = {};
        }
        options.requestInit.headers = {
          ...options.requestInit.headers,
          ...this.serverConfig.headers,
        };
        break;
      case 'headers':
      default:
        // Merge with existing headers (from forwardHeaders)
        if (!options.requestInit) {
          options.requestInit = {};
        }
        options.requestInit.headers = {
          ...options.requestInit.headers,
          ...this.serverConfig.headers,
        };
        break;
    }
    if (this.upstreamSessionId) {
      options.sessionId = this.upstreamSessionId;
    }

    // Add static passthrough headers from config
    if (this.serverConfig.passthroughHeaders) {
      if (!options.requestInit) {
        options.requestInit = {};
      }
      if (!options.requestInit.headers) {
        options.requestInit.headers = {};
      }
      options.requestInit.headers = {
        ...options.requestInit.headers,
        ...this.serverConfig.passthroughHeaders,
      };
    }

    // Add user identity headers (highest priority - applied last)
    if (this.serverConfig.user_identity_forwarding && this.tokenInfo) {
      const identityHeaders = await buildUserIdentityHeaders(
        this.serverConfig.user_identity_forwarding,
        this.tokenInfo
      );

      if (Object.keys(identityHeaders).length > 0) {
        if (!options.requestInit) {
          options.requestInit = {};
        }
        if (!options.requestInit.headers) {
          options.requestInit.headers = {};
        }
        options.requestInit.headers = {
          ...options.requestInit.headers,
          ...identityHeaders,
        };
        this.logger.debug(
          `Added user identity headers: ${Object.keys(identityHeaders).join(', ')}`
        );
      }
    }

    options.fetch = async (url: any, init: any) => {
      // Merge dynamic headers into each request (for pooled connections)
      // Dynamic headers are set per-request via updateDynamicHeaders()
      // Note: init.headers may be a Headers object, not a plain object
      const existingHeaders =
        init?.headers instanceof Headers
          ? Object.fromEntries(init.headers.entries())
          : init?.headers || {};

      // SECURITY: Dynamic headers (from forwardHeaders) have LOWEST priority
      // They must NOT override auth headers or passthroughHeaders from config
      // Order: dynamicHeaders < existingHeaders (which includes auth + passthrough)
      const mergedInit = {
        ...init,
        headers: {
          ...this.dynamicHeaders,
          ...existingHeaders,
        },
      };

      const response = await externalServiceFetchWithNodeFetch(
        url.toString(),
        mergedInit
      );

      // Convert Node.js stream to Web stream
      // node-fetch returns a Node.js Readable stream, not a Web ReadableStream
      if (response.body && response.body instanceof Readable) {
        const nodeStream = response.body;

        // Create a controlled Web stream to handle the Node.js to Web stream conversion
        // This avoids ERR_INVALID_STATE errors when data arrives after controller closes
        const webStream = new ReadableStream({
          start(controller) {
            nodeStream.on('data', (chunk) => {
              try {
                controller.enqueue(chunk);
              } catch {
                // Ignore "Controller is already closed" errors - benign race condition
              }
            });
            nodeStream.on('end', () => {
              try {
                controller.close();
              } catch {
                // Already closed
              }
            });
            nodeStream.on('error', (err) => {
              try {
                controller.error(err);
              } catch {
                // Already closed
              }
            });
          },
          cancel() {
            nodeStream.destroy();
          },
        });

        return new Response(webStream, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers as any,
        });
      }

      return response;
    };
    return options;
  }

  private async makeTransport(
    transportType: ClientTransportTypes
  ): Promise<ClientTransport> {
    const upstreamUrl = new URL(this.serverConfig.url);
    const options = await this.getTransportOptions();
    return new transportType(upstreamUrl, options as any);
  }

  private async connectOne(
    transportType: ClientTransportTypes
  ): Promise<ConnectResult> {
    try {
      const transport = await this.makeTransport(transportType);
      await this.client!.connect(transport);
      this.upstreamSessionId = (transport as any).sessionId || undefined;

      this.connected = true;

      await this.fetchCapabilities();

      // Sample handlers
      this.setElicitHandler(async () => {
        this.logger.warn('===> TODO: handle elicitation');
      });
      this.setSamplingHandler(async () => {
        this.logger.warn('===> TODO: handle sampling');
      });
      this.setCompletionHandler(async () => {
        this.logger.warn('===> TODO: handle completion');
      });
      this.setNotificationHandler(async () => {
        this.logger.warn('===> TODO: handle notification');
      });
      this.setRequestHandler(async () => {
        this.logger.warn('===> TODO: handle request');
      });

      return {
        ok: true,
        sessionId: this.upstreamSessionId,
        type: 'http',
      };
    } catch (e: any) {
      if (e?.needsAuthorization) {
        this.authProvider?.invalidateCredentials('all');
        this.authProvider = undefined;
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
   * Fetch upstream capabilities and metadata
   */
  async fetchCapabilities(): Promise<void> {
    try {
      this.logger.debug('Fetching upstream capabilities and metadata');

      // Get server capabilities from the client
      this.serverCapabilities = this.client!.getServerCapabilities();

      // Get server info (Implementation interface from MCP spec)
      this.serverInfo = this.client!.getServerVersion() as any;

      // Get LLM instructions if available
      this.instructions = (this.client as any).getInstructions?.();

      this.logger.debug(
        `Server info: ${this.serverInfo?.name} v${this.serverInfo?.version}`
      );
    } catch (error) {
      this.logger.error('Failed to fetch upstream capabilities', error);
    }
  }

  /**
   * Get the upstream server's version/info
   * Returns the server name and version as reported by the upstream MCP server
   */
  getServerVersion(): { name: string; version: string } | undefined {
    return this.client?.getServerVersion();
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
    this.logger.debug('Listing tools from upstream');
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

  async setElicitHandler(
    handler: (elicitation: any, extra: any) => Promise<any>
  ): Promise<void> {
    if (!this.client) {
      throw new Error('No upstream client available');
    }
    this.client.setRequestHandler(ElicitRequestSchema, handler);
  }

  async setSamplingHandler(
    handler: (sampling: any, extra: any) => Promise<any>
  ): Promise<void> {
    if (!this.client) {
      throw new Error('No upstream client available');
    }
    this.client.setRequestHandler(CreateMessageRequestSchema, handler);
  }

  async setCompletionHandler(
    handler: (completion: any, extra: any) => Promise<any>
  ): Promise<void> {
    if (!this.client) {
      throw new Error('No upstream client available');
    }
    this.client.setRequestHandler(CompleteRequestSchema, handler);
  }

  /**
   * Set a handler for ANY notification that doesn't have a specific handler
   * This acts as a catch-all for all notifications from the upstream server
   */
  async setNotificationHandler(
    handler: (notification: any) => Promise<void>
  ): Promise<void> {
    if (!this.client) {
      throw new Error('No upstream client available');
    }
    // Use the fallback handler to catch ALL notifications
    this.client.fallbackNotificationHandler = handler;
  }

  /**
   * Set a handler for ANY request that doesn't have a specific handler
   * This acts as a catch-all for all requests from the upstream server
   */
  async setRequestHandler(
    handler: (request: any, extra: any) => Promise<any>
  ): Promise<void> {
    if (!this.client) {
      throw new Error('No upstream client available');
    }
    // Use the fallback handler to catch ALL requests
    this.client.fallbackRequestHandler = handler;
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

  /**
   * Update dynamic headers for per-request header injection.
   * Called before each request on pooled connections to ensure
   * fresh headers (trace IDs, refreshed tokens, etc.) are used.
   */
  updateDynamicHeaders(headers: Record<string, string> | undefined): void {
    this.dynamicHeaders = headers || {};
  }

  /**
   * Get current dynamic headers (for testing/debugging)
   */
  getDynamicHeaders(): Record<string, string> {
    return { ...this.dynamicHeaders };
  }
}
