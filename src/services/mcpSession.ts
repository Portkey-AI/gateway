/**
 * @file src/services/mcpSession.ts
 * MCP session that bridges client and upstream server
 */

import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCError,
  CallToolRequest,
  ListToolsRequest,
  ErrorCode,
  RequestId,
  InitializeRequest,
  InitializeResult,
  Tool,
  EmptyResultSchema,
} from '@modelcontextprotocol/sdk/types';
import { ServerConfig } from '../types/mcp';
import { createLogger } from '../utils/logger';
import { GatewayOAuthProvider } from './upstreamOAuth';
import { CacheService, getMcpServersCache } from './cache';

export type TransportType = 'streamable-http' | 'sse' | 'auth-required';

export interface TransportCapabilities {
  clientTransport: TransportType;
  upstreamTransport: TransportType;
}

type SessionStatus =
  | 'new'
  | 'initializing'
  | 'initialized'
  | 'dormant'
  | 'closed';

interface SessionState {
  status: SessionStatus;
  hasUpstream: boolean;
  hasDownstream: boolean;
  needsUpstreamAuth: boolean;
}

/**
 * UpstreamManager - Manages upstream server connections and communication
 */
class UpstreamManager {
  private upstreamClient?: Client;
  private upstreamTransport?:
    | StreamableHTTPClientTransport
    | SSEClientTransport;
  private upstreamCapabilities?: any;
  private availableTools?: Tool[];
  private logger;
  private config: ServerConfig;
  private authHandler: AuthenticationHandler;
  private stateManager: SessionStateManager;
  private gatewayName: string;
  private upstreamSessionId?: string;

  constructor(
    config: ServerConfig,
    authHandler: AuthenticationHandler,
    stateManager: SessionStateManager,
    gatewayName: string,
    logger?: any,
    upstreamSessionId?: string
  ) {
    this.config = config;
    this.authHandler = authHandler;
    this.stateManager = stateManager;
    this.gatewayName = gatewayName;
    this.logger = logger || createLogger('UpstreamManager');
    this.upstreamSessionId = upstreamSessionId;
  }

  /**
   * Connect to upstream server
   */
  async connect(): Promise<{ type: TransportType; sessionId?: string }> {
    const upstreamUrl = new URL(this.config.url);
    this.logger.debug(
      `Connecting to ${this.config.url} with auth_type: ${this.config.auth_type}`
    );

    // Prepare transport options based on auth type
    const transportOptions = this.authHandler.getTransportOptions();

    // Try Streamable HTTP first (most common)
    try {
      this.logger.debug('Trying Streamable HTTP transport', {
        url: this.config.url,
        transportOptions,
      });
      let httpTransportOptions: any = transportOptions;
      if (this.upstreamSessionId) {
        httpTransportOptions = {
          ...transportOptions,
          sessionId: this.upstreamSessionId,
        };
      }
      this.upstreamTransport = new StreamableHTTPClientTransport(
        upstreamUrl,
        httpTransportOptions
      );

      this.upstreamClient = new Client({
        name: `${this.gatewayName}-client`,
        version: '1.0.0',
      });

      await this.upstreamClient.connect(this.upstreamTransport);
      // TODO: store session ID in session cache
      this.stateManager.setHasUpstream(true);

      this.upstreamSessionId = this.upstreamTransport.sessionId;

      // Fetch capabilities synchronously during initialization
      await this.fetchCapabilities();

      return {
        type: 'streamable-http',
        sessionId: this.upstreamTransport.sessionId || undefined,
      };
    } catch (error: any) {
      // Check if this is an authorization error
      if (error.needsAuthorization) {
        this.authHandler.setPendingAuthorization(error);

        // Don't throw if we're in a consent flow context
        // The session can still be created, just without upstream connection
        this.stateManager.setNeedsUpstreamAuth(true);

        // Wait for 2 minutes to check if auth can be completed
        if (
          await this.authHandler.finishUpstreamAuthAndConnect(
            this.upstreamTransport
          )
        ) {
          this.stateManager.setNeedsUpstreamAuth(false);
          return this.connect();
        }

        throw error;
      }

      // Fall back to SSE
      this.logger.debug('Streamable HTTP failed, trying SSE');
      try {
        this.upstreamTransport = new SSEClientTransport(
          upstreamUrl,
          transportOptions
        );

        this.upstreamClient = new Client({
          name: `${this.gatewayName}-client`,
          version: '1.0.0',
        });

        await this.upstreamClient.connect(this.upstreamTransport);
        this.stateManager.setHasUpstream(true);

        // Fetch capabilities synchronously during initialization
        await this.fetchCapabilities();

        return { type: 'sse' };
      } catch (sseError: any) {
        // Check if SSE also failed due to authorization
        if (sseError.needsAuthorization) {
          this.authHandler.setPendingAuthorization(sseError);

          // Don't throw if we're in a consent flow context
          // The session can still be created, just without upstream connection
          this.stateManager.setNeedsUpstreamAuth(true);

          if (
            await this.authHandler.finishUpstreamAuthAndConnect(
              this.upstreamTransport
            )
          ) {
            this.stateManager.setNeedsUpstreamAuth(false);
            return this.connect();
          }

          throw sseError;
        }

        this.logger.error('Both transports failed', {
          streamableHttp: error,
          sse: sseError,
        });
        throw new Error(`Failed to connect to upstream with any transport`);
      }
    }
  }

  /**
   * Fetch upstream capabilities
   */
  async fetchCapabilities(): Promise<void> {
    try {
      this.logger.debug('Fetching upstream capabilities');
      const toolsResult = await this.upstreamClient!.listTools();
      this.availableTools = toolsResult.tools;

      // Get server capabilities from the client
      this.upstreamCapabilities =
        this.upstreamClient!.getServerCapabilities() || {
          tools: {},
        };
      this.logger.debug(`Found ${this.availableTools.length} tools`);
    } catch (error) {
      this.logger.error('Failed to fetch upstream capabilities', error);
      this.upstreamCapabilities = { tools: {} };
    }
  }

  /**
   * Get upstream capabilities
   */
  getCapabilities(): any {
    return this.upstreamCapabilities;
  }

  /**
   * Get available tools
   */
  getAvailableTools(): Tool[] | undefined {
    return this.availableTools;
  }

  /**
   * Get the upstream client
   */
  getClient(): Client | undefined {
    return this.upstreamClient;
  }

  /**
   * Get the upstream transport
   */
  getTransport():
    | StreamableHTTPClientTransport
    | SSEClientTransport
    | undefined {
    return this.upstreamTransport;
  }

  /**
   * Send a message to upstream
   */
  async send(message: any): Promise<void> {
    if (!this.upstreamTransport) {
      throw new Error('No upstream transport available');
    }
    await this.upstreamTransport.send(message);
  }

  /**
   * Send a notification to upstream
   */
  async notification(message: any): Promise<void> {
    if (!this.upstreamClient) {
      throw new Error('No upstream client available');
    }
    await this.upstreamClient.notification(message);
  }

  /**
   * Forward a request to upstream
   */
  async request(request: any, schema?: any): Promise<any> {
    if (!this.upstreamClient) {
      throw new Error('No upstream client available');
    }
    return this.upstreamClient.request(request, schema || {});
  }

  /**
   * Call a tool on upstream
   */
  async callTool(params: any): Promise<any> {
    if (!this.upstreamClient) {
      throw new Error('No upstream client available');
    }
    return this.upstreamClient.callTool(params);
  }

  /**
   * List tools from upstream
   */
  async listTools(): Promise<any> {
    if (!this.upstreamClient) {
      throw new Error('No upstream client available');
    }
    return this.upstreamClient.listTools();
  }

  async ping(): Promise<any> {
    if (!this.upstreamClient) {
      throw new Error('No upstream client available');
    }
    return this.upstreamClient.ping();
  }

  async complete(params: any): Promise<any> {
    if (!this.upstreamClient) {
      throw new Error('No upstream client available');
    }
    return this.upstreamClient.complete(params);
  }

  async setLoggingLevel(params: any): Promise<any> {
    if (!this.upstreamClient) {
      throw new Error('No upstream client available');
    }
    return this.upstreamClient.setLoggingLevel(params.level);
  }

  async getPrompt(params: any): Promise<any> {
    if (!this.upstreamClient) {
      throw new Error('No upstream client available');
    }
    return this.upstreamClient.getPrompt(params);
  }

  async listPrompts(params: any): Promise<any> {
    if (!this.upstreamClient) {
      throw new Error('No upstream client available');
    }
    return this.upstreamClient.listPrompts(params);
  }

  async listResources(params: any): Promise<any> {
    if (!this.upstreamClient) {
      throw new Error('No upstream client available');
    }
    return this.upstreamClient.listResources(params);
  }

  async listResourceTemplates(params: any): Promise<any> {
    if (!this.upstreamClient) {
      throw new Error('No upstream client available');
    }
    return this.upstreamClient.listResourceTemplates(params);
  }

  async readResource(params: any): Promise<any> {
    if (!this.upstreamClient) {
      throw new Error('No upstream client available');
    }
    return this.upstreamClient.readResource(params);
  }

  async subscribeResource(params: any): Promise<any> {
    if (!this.upstreamClient) {
      throw new Error('No upstream client available');
    }
    return this.upstreamClient.subscribeResource(params);
  }

  async unsubscribeResource(params: any): Promise<any> {
    if (!this.upstreamClient) {
      throw new Error('No upstream client available');
    }
    return this.upstreamClient.unsubscribeResource(params);
  }

  /**
   * Close the upstream connection
   */
  async close(): Promise<void> {
    await this.upstreamClient?.close();
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.stateManager.hasUpstream;
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

/**
 * AuthenticationHandler - Manages authentication flows and authorization state
 */
class AuthenticationHandler {
  private pendingAuthorizationServerId?: string;
  private pendingAuthorizationWorkspaceId?: string;
  private authorizationError?: Error;
  private authorizationUrl?: string;
  private logger;
  private mcpServersCache: CacheService;
  private gatewayToken?: any;
  private config: ServerConfig;

  constructor(config: ServerConfig, gatewayToken?: any, logger?: any) {
    this.config = config;
    this.gatewayToken = gatewayToken;
    this.logger = logger || createLogger('AuthHandler');
    this.mcpServersCache = getMcpServersCache();
  }

  /**
   * Check if session has a pending authorization
   */
  hasPendingAuthorization(): boolean {
    return this.pendingAuthorizationServerId !== undefined;
  }

  /**
   * Get pending authorization details
   */
  getPendingAuthorization(): {
    serverId: string;
    workspaceId: string;
    authorizationUrl?: string;
  } | null {
    if (!this.pendingAuthorizationServerId || !this.authorizationError) {
      return null;
    }
    return {
      serverId: this.pendingAuthorizationServerId,
      workspaceId:
        this.pendingAuthorizationWorkspaceId || this.config.workspaceId,
      authorizationUrl: this.authorizationUrl,
    };
  }

  /**
   * Set pending authorization
   */
  setPendingAuthorization(error: any): void {
    if (error.needsAuthorization) {
      this.pendingAuthorizationServerId = error.serverId;
      this.pendingAuthorizationWorkspaceId = error.workspaceId;
      this.authorizationError = error;
      this.authorizationUrl = error.authorizationUrl;
      this.logger.debug(
        `Server ${error.workspaceId}/${error.serverId} requires authorization`
      );
    }
  }

  /**
   * Clear pending authorization
   */
  clearPendingAuthorization(): void {
    this.pendingAuthorizationServerId = undefined;
    this.pendingAuthorizationWorkspaceId = undefined;
    this.authorizationError = undefined;
    this.authorizationUrl = undefined;
  }

  /**
   * Get transport options based on authentication type
   */
  getTransportOptions() {
    switch (this.config.auth_type) {
      case 'oauth_auto':
        this.logger.debug('Using OAuth auto-discovery for authentication');
        return {
          authProvider: new GatewayOAuthProvider(
            this.config,
            this.gatewayToken
          ),
        };

      case 'oauth_client_credentials':
        // TODO: Implement client credentials flow
        this.logger.warn(
          'oauth_client_credentials not yet implemented, falling back to headers'
        );
        return {
          requestInit: {
            headers: this.config.headers,
          },
        };

      case 'headers':
      default:
        return {
          requestInit: {
            headers: this.config.headers,
          },
        };
    }
  }

  /**
   * Poll for upstream authentication code
   */
  async pollForUpstreamAuth(): Promise<string | null> {
    // Poll every second until clientInfo exists in cache for this user, serverID combination
    // With a max timeout of 120 seconds
    const maxTimeout = 120;
    const startTime = Date.now();
    while (Date.now() - startTime < maxTimeout * 1000) {
      this.logger.debug('Polling for authorization code in cache', {
        startTime,
        maxTimeout,
        currentTime: Date.now(),
        username: this.gatewayToken?.username,
        serverId: this.config.serverId,
        workspaceId: this.config.workspaceId,
      });
      const cacheKey = `${this.gatewayToken?.username}::${this.config.workspaceId}::${this.config.serverId}`;
      const authorizationCode = await this.mcpServersCache.get(
        cacheKey,
        'authorization_codes'
      );
      if (authorizationCode) {
        this.logger.debug('Authorization code found');
        return authorizationCode.code;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return null;
  }

  /**
   * Finish upstream auth and connect
   */
  async finishUpstreamAuthAndConnect(upstreamTransport: any): Promise<boolean> {
    const authCode = await this.pollForUpstreamAuth();
    if (authCode && upstreamTransport) {
      this.logger.debug('Found authCode, retrying connection', authCode);
      await upstreamTransport.finishAuth(authCode);
      this.clearPendingAuthorization();
      return true;
    }
    return false;
  }

  /**
   * Get authorization URL if pending
   */
  getAuthorizationUrl(): string | undefined {
    return this.authorizationUrl;
  }
}

/**
 * SessionStateManager - Manages the state transitions and state-related logic for MCPSession
 */
class SessionStateManager {
  private state: SessionState = {
    status: 'new',
    hasUpstream: false,
    hasDownstream: false,
    needsUpstreamAuth: false,
  };

  // Simple state getters
  get status(): SessionStatus {
    return this.state.status;
  }

  get isInitializing(): boolean {
    return this.state.status === 'initializing';
  }

  get isInitialized(): boolean {
    return this.state.status === 'initialized';
  }

  get isClosed(): boolean {
    return this.state.status === 'closed';
  }

  get isDormant(): boolean {
    return this.state.status === 'dormant';
  }

  get hasUpstream(): boolean {
    return this.state.hasUpstream;
  }

  get hasDownstream(): boolean {
    return this.state.hasDownstream;
  }

  get needsUpstreamAuth(): boolean {
    return this.state.needsUpstreamAuth;
  }

  // State setters
  setStatus(status: SessionStatus): void {
    this.state.status = status;
  }

  setHasUpstream(value: boolean): void {
    this.state.hasUpstream = value;
  }

  setHasDownstream(value: boolean): void {
    this.state.hasDownstream = value;
  }

  setNeedsUpstreamAuth(value: boolean): void {
    this.state.needsUpstreamAuth = value;
  }

  // Composite state checks
  isActive(): boolean {
    return (
      this.state.status === 'initialized' &&
      this.state.hasDownstream &&
      this.state.hasUpstream
    );
  }

  // State transitions
  startInitializing(): void {
    this.state.status = 'initializing';
  }

  completeInitialization(): void {
    this.state.status = 'initialized';
  }

  markAsClosed(): void {
    this.state.status = 'closed';
    this.state.hasUpstream = false;
    this.state.hasDownstream = false;
    this.state.needsUpstreamAuth = false;
  }

  markAsDormant(): void {
    this.state.status = 'dormant';
  }

  resetToNew(): void {
    this.state.status = 'new';
  }

  // Get current state snapshot
  getState(): string {
    if (this.isActive()) return 'active';
    return this.state.status;
  }
}

export class MCPSession {
  public id: string;
  public createdAt: number;
  public lastActivity: number;

  private downstreamTransport?:
    | StreamableHTTPServerTransport
    | SSEServerTransport;
  private transportCapabilities?: TransportCapabilities;

  private stateManager = new SessionStateManager();
  private authHandler: AuthenticationHandler;
  private upstreamManager: UpstreamManager;

  private logger;

  // Session expiration tied to token lifecycle
  private tokenExpiresAt?: number;

  public readonly config: ServerConfig;
  public readonly gatewayName: string;
  public readonly gatewayToken?: any;
  public upstreamSessionId?: string;

  constructor(options: {
    config: ServerConfig;
    gatewayName?: string;
    sessionId?: string;
    gatewayToken?: any;
    upstreamSessionId?: string;
  }) {
    this.config = options.config;
    this.gatewayName = options.gatewayName || 'portkey-mcp-gateway';
    this.gatewayToken = options.gatewayToken;
    this.id = options.sessionId || crypto.randomUUID();
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.logger = createLogger(`Session:${this.id.substring(0, 8)}`);
    this.upstreamSessionId = options.upstreamSessionId;
    this.authHandler = new AuthenticationHandler(
      this.config,
      this.gatewayToken,
      this.logger
    );
    this.upstreamManager = new UpstreamManager(
      this.config,
      this.authHandler,
      this.stateManager,
      this.gatewayName,
      this.logger,
      this.upstreamSessionId
    );
    this.setTokenExpiration(options.gatewayToken);
  }

  /**
   * Simple state checks
   */
  get isInitializing(): boolean {
    return this.stateManager.isInitializing;
  }

  get isInitialized(): boolean {
    return this.stateManager.isInitialized;
  }

  get isClosed(): boolean {
    return this.stateManager.isClosed;
  }

  get isDormantSession(): boolean {
    return this.stateManager.isDormant;
  }

  set isDormantSession(value: boolean) {
    if (value) {
      this.stateManager.markAsDormant();
    } else if (this.stateManager.isDormant) {
      // Only change from dormant if we're currently dormant
      this.stateManager.resetToNew();
    }
  }

  getState(): string {
    return this.stateManager.getState();
  }

  /**
   * Initialize or restore session
   */
  async initializeOrRestore(
    clientTransportType?: TransportType
  ): Promise<Transport> {
    if (this.isActive()) return this.downstreamTransport!;

    if (this.isClosed) throw new Error('Cannot initialize closed session');

    // Handle initializing state
    if (this.isInitializing) {
      // Wait for initialization with timeout
      const timeout = 30000; // 30 seconds
      const startTime = Date.now();

      while (this.isInitializing && Date.now() - startTime < timeout) {
        await new Promise((resolve) => setTimeout(resolve, 100)); // Check every 100ms
      }

      if (this.isInitializing) {
        throw new Error('Session initialization timed out after 30 seconds');
      }

      if (this.downstreamTransport) {
        return this.downstreamTransport;
      }

      throw new Error('Session initialization failed');
    }

    // TODO: check if this is needed
    if (this.isDormant()) {
      this.logger.debug(`Restoring dormant session ${this.id}`);
      this.isDormantSession = true;
    }

    if (!clientTransportType)
      clientTransportType = this.getClientTransportType();

    return this.initialize(clientTransportType!);
  }

  /**
   * Initialize the session
   */
  private async initialize(
    clientTransportType: TransportType
  ): Promise<Transport> {
    this.stateManager.startInitializing();
    try {
      // Try to connect to upstream with best available transport
      this.logger.debug('Connecting to upstream server...');
      const upstream = await this.upstreamManager.connect();

      // Store transport capabilities for translation
      this.transportCapabilities = {
        clientTransport: clientTransportType,
        upstreamTransport: upstream.type,
      };

      this.upstreamSessionId = upstream.sessionId;

      this.logger.debug(
        `Connected Upstream: ${clientTransportType} -> ${upstream.type}`
      );

      // Create downstream transport for client
      const transport = this.createDownstreamTransport(clientTransportType);

      this.stateManager.completeInitialization();
      this.logger.debug('Session initialization completed');
      return transport;
    } catch (error) {
      this.logger.error('Session initialization failed', error);
      this.stateManager.resetToNew(); // Reset to new state on failure
      throw error;
    }
  }

  /**
   * Create downstream transport
   */
  private createDownstreamTransport(
    clientTransportType: TransportType
  ): Transport {
    this.logger.debug(`Creating ${clientTransportType} downstream transport`);

    if (clientTransportType === 'sse') {
      // For SSE clients, create SSE server transport
      this.downstreamTransport = new SSEServerTransport(
        `/messages?sessionId=${this.id || crypto.randomUUID()}`,
        null as any
      );
    } else {
      // Creating stateless Streamable HTTP server transport
      // since state management is a pain and is just not ready for production
      this.downstreamTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      // Handle dormant session restoration inline
      // if (this.isDormantSession) {
      //   this.logger.debug(
      //     'Marking transport as initialized for dormant session'
      //   );
      //   (this.downstreamTransport as any)._initialized = true;
      //   (this.downstreamTransport as any).sessionId = this.id;
      // }
    }

    // Set message handler directly
    this.downstreamTransport.onmessage = this.handleClientMessage.bind(this);

    this.stateManager.setHasDownstream(true);
    return this.downstreamTransport;
  }

  /**
   * Get the transport capabilities (client and upstream)
   */
  getTransportCapabilities(): TransportCapabilities | undefined {
    return this.transportCapabilities;
  }

  /**
   * Check if session has upstream connection (needed for tool calls)
   */
  hasUpstreamConnection(): boolean {
    return this.stateManager.hasUpstream;
  }

  /**
   * Check if session is dormant (has metadata but no active connections)
   */
  isDormant(): boolean {
    return (
      this.stateManager.isDormant ||
      (!!this.transportCapabilities &&
        !this.isInitialized &&
        !this.hasUpstreamConnection())
    );
  }

  /**
   * Check if session has a pending authorization
   */
  hasPendingAuthorization(): boolean {
    return this.authHandler.hasPendingAuthorization();
  }

  /**
   * Get pending authorization details
   */
  getPendingAuthorization(): {
    serverId: string;
    workspaceId: string;
    authorizationUrl?: string;
  } | null {
    return this.authHandler.getPendingAuthorization();
  }

  /**
   * Check if session needs upstream auth
   */
  needsUpstreamAuth(): boolean {
    return this.stateManager.needsUpstreamAuth;
  }

  /**
   * Check if a method requires upstream connection
   */
  isUpstreamMethod(method: string): boolean {
    // These methods can be handled locally without upstream
    const localMethods = ['ping', 'logs/list'];
    return !localMethods.includes(method);
  }

  /**
   * Check if session is active
   */
  isActive(): boolean {
    return this.stateManager.isActive();
  }

  /**
   * Set token expiration for session lifecycle management
   * Session will be considered expired when token expires
   */
  setTokenExpiration(tokenInfo: any): void {
    if (tokenInfo?.exp) {
      // Token expiration is in seconds, convert to milliseconds
      this.tokenExpiresAt = tokenInfo.exp * 1000;
      this.logger.debug(
        `Session ${this.id} token expires at ${new Date(this.tokenExpiresAt).toISOString()}`
      );
    } else if (tokenInfo?.expires_in) {
      // Relative expiration in seconds
      this.tokenExpiresAt = Date.now() + tokenInfo.expires_in * 1000;
      this.logger.debug(
        `Session ${this.id} token expires in ${tokenInfo.expires_in} seconds`
      );
    }
  }

  /**
   * Check if session is expired based on token expiration
   */
  isTokenExpired(): boolean {
    if (!this.tokenExpiresAt) {
      return false; // No expiration set, rely on session timeout
    }

    const expired = Date.now() > this.tokenExpiresAt;
    if (expired) {
      this.logger.debug(
        `Session ${this.id} token expired at ${new Date(this.tokenExpiresAt).toISOString()}`
      );
    }
    return expired;
  }

  /**
   * Get token expiration info for debugging
   */
  getTokenExpiration(): { expiresAt?: number; isExpired: boolean } {
    return {
      expiresAt: this.tokenExpiresAt,
      isExpired: this.isTokenExpired(),
    };
  }

  /**
   * Restore session from saved data - only restore basic data, defer full initialization
   */
  async restoreFromData(data: {
    id: string;
    createdAt: number;
    lastActivity: number;
    transportCapabilities?: TransportCapabilities;
    clientTransportType?: TransportType;
    tokenExpiresAt?: number;
    upstreamSessionId?: string;
  }): Promise<void> {
    // Restore basic properties
    this.id = data.id;
    this.createdAt = data.createdAt;
    this.lastActivity = data.lastActivity;
    this.upstreamSessionId = data.upstreamSessionId;

    // Restore token expiration if available
    if (data.tokenExpiresAt) {
      this.tokenExpiresAt = data.tokenExpiresAt;
      this.logger.debug(
        `Session ${this.id} restored with token expiration: ${new Date(this.tokenExpiresAt).toISOString()}`
      );
    }

    // Store transport capabilities for later use, but don't initialize yet
    if (data.transportCapabilities && data.clientTransportType) {
      this.transportCapabilities = data.transportCapabilities;
      this.isDormantSession = true; // Mark this as a dormant session being restored
      this.logger.debug(
        'Session metadata restored, awaiting client reconnection'
      );
    } else {
      this.logger.warn('Session restored but missing transport data');
    }

    // Mark as dormant since this is just metadata restoration
    this.stateManager.markAsDormant();
  }

  /**
   * Ensure upstream connection is established
   */
  async ensureUpstreamConnection(): Promise<void> {
    if (this.hasUpstreamConnection()) {
      return; // Already connected
    }

    try {
      this.logger.debug('**** Establishing upstream connection...');
      const upstreamTransport = await this.upstreamManager.connect();
      this.upstreamSessionId = upstreamTransport.sessionId;
      this.logger.debug('Upstream connection established');
    } catch (error) {
      this.logger.error('Failed to establish upstream connection', error);
      throw error;
    }
  }

  /**
   * Get the client transport type
   */
  getClientTransportType(): TransportType | undefined {
    return this.transportCapabilities?.clientTransport;
  }

  /**
   * Get the upstream transport type
   */
  getUpstreamTransportType(): TransportType | undefined {
    return this.transportCapabilities?.upstreamTransport;
  }

  /**
   * Initialize SSE transport with response object
   */
  initializeSSETransport(res: any): SSEServerTransport {
    const transport = new SSEServerTransport(
      `${this.config.workspaceId}/${this.config.serverId}/messages`,
      res
    );

    // Set up message handling
    transport.onmessage = async (message: JSONRPCMessage, extra: any) => {
      await this.handleClientMessage(message, extra);
    };

    this.downstreamTransport = transport;
    this.id = transport.sessionId;
    return transport;
  }

  /**
   * Get the SSE session ID from the transport (used for client communication)
   */
  getSSESessionId(): string | undefined {
    if (
      this.downstreamTransport &&
      'getSessionId' in this.downstreamTransport
    ) {
      return (this.downstreamTransport as any)._sessionId;
    }
    return undefined;
  }

  /**
   * Handle client message - optimized hot path
   */
  private async handleClientMessage(message: any, extra?: any) {
    this.lastActivity = Date.now();

    try {
      // Fast type check using property existence
      if ('method' in message && 'id' in message) {
        // It's a request - handle directly without type checking functions
        await this.handleClientRequest(message, extra);
      } else if ('result' in message || 'error' in message) {
        // It's a response - forward directly
        await this.upstreamManager.send(message);
      } else if ('method' in message) {
        // It's a notification - forward directly
        await this.upstreamManager.notification(message);
      }
    } catch (error) {
      // Send error response if this was a request
      if ('id' in message) {
        await this.sendError(
          message.id,
          ErrorCode.InternalError,
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  }

  /**
   * Handle requests from the client - optimized with hot paths first
   */
  private async handleClientRequest(request: any, extra?: any) {
    const method = request.method;

    // Check if we need upstream auth for any upstream-dependent operations
    if (this.needsUpstreamAuth() && this.isUpstreamMethod(method)) {
      const authDetails = this.getPendingAuthorization();
      await this.sendError(
        request.id,
        ErrorCode.InternalError,
        `Server ${authDetails?.serverId || this.config.serverId} requires authorization. Please complete the OAuth flow.`,
        { needsAuth: true, serverId: authDetails?.serverId }
      );
      return;
    }

    // Direct method handling without switch overhead for hot paths
    if (method === 'tools/call') {
      await this.handleToolCall(request);
    } else if (method === 'tools/list') {
      await this.handleToolsList(request);
    } else if (method === 'initialize') {
      await this.handleInitialize(request);
    } else if (this.upstreamManager.isKnownRequest(request.method)) {
      await this.handleKnownRequests(request);
    } else {
      // Forward all other requests directly to upstream
      this.logger.debug(`Forwarding request: ${method}`);
      await this.forwardRequest(request);
    }
  }

  /**
   * Handle initialization request
   */
  private async handleInitialize(request: InitializeRequest) {
    this.logger.debug('Processing initialize request');

    // Don't forward initialization to upstream - upstream is already connected
    // Instead, respond with our gateway's capabilities based on upstream
    const upstreamCapabilities = this.upstreamManager.getCapabilities();
    const availableTools = this.upstreamManager.getAvailableTools();

    const gatewayResult: InitializeResult = {
      protocolVersion: request.params.protocolVersion,
      capabilities: {
        // Use cached upstream capabilities or default ones
        ...upstreamCapabilities,
        // Add tools capability if we have tools available
        tools:
          availableTools && availableTools.length > 0
            ? {} // Empty object indicates tools support
            : undefined,
      },
      serverInfo: {
        name: 'portkey-mcp-gateway',
        version: '1.0.0',
      },
    };

    this.logger.debug(
      `Sending initialize response with tools: ${!!gatewayResult.capabilities.tools}`
    );
    // Send gateway response
    await this.sendResult((request as any).id, gatewayResult);
  }

  /**
   * Handle tools/list request with filtering
   */
  private async handleToolsList(request: ListToolsRequest) {
    // Get tools from upstream
    this.logger.debug('Fetching tools from upstream');

    let upstreamResult;
    try {
      // Ensure upstream connection is established
      await this.ensureUpstreamConnection();

      // Add timeout to prevent hanging on unresponsive servers
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(
                'Timeout: Upstream server did not respond within 10 seconds'
              )
            ),
          10000
        );
      });

      upstreamResult = await Promise.race([
        this.upstreamManager.listTools(),
        timeoutPromise,
      ]);
      this.logger.debug(
        `Received ${upstreamResult.tools.length} tools from upstream`
      );
    } catch (error) {
      this.logger.error('Failed to get tools from upstream', error);
      await this.sendError(
        (request as any).id,
        ErrorCode.InternalError,
        `Failed to get tools from upstream: ${error instanceof Error ? error.message : String(error)}`
      );
      return;
    }

    // Apply filtering based on configuration
    let tools = upstreamResult.tools;

    if (this.config.tools) {
      const { allowed, blocked } = this.config.tools;

      // Filter blocked tools
      if (blocked && blocked.length > 0) {
        tools = tools.filter((tool: Tool) => !blocked.includes(tool.name));
      }

      // Filter to only allowed tools
      if (allowed && allowed.length > 0) {
        tools = tools.filter((tool: Tool) => allowed.includes(tool.name));
      }
    }

    // Log filtered tools
    if (tools.length !== upstreamResult.tools.length) {
      this.logger.debug(
        `Filtered tools: ${tools.length} of ${upstreamResult.tools.length} available`
      );
    }

    // Send filtered result
    await this.sendResult((request as any).id, { tools });
  }

  /**
   * Handle tools/call request with validation
   */
  private async handleToolCall(request: CallToolRequest) {
    const toolName = request.params.name;
    this.logger.debug(`Tool call: ${toolName}`);

    // Validate tool access
    if (this.config.tools) {
      const { allowed, blocked } = this.config.tools;

      // Check if tool is blocked
      if (blocked && blocked.includes(toolName)) {
        await this.sendError(
          (request as any).id,
          ErrorCode.InvalidParams,
          `Tool '${toolName}' is blocked by a policy`
        );
        return;
      }

      // Check if tool is in allowed list
      if (allowed && allowed.length > 0 && !allowed.includes(toolName)) {
        await this.sendError(
          (request as any).id,
          ErrorCode.InvalidParams,
          `Tool '${toolName}' is not in the allowed list`
        );
        return;
      }
    }

    // Check if tool exists upstream
    const availableTools = this.upstreamManager.getAvailableTools();
    if (availableTools && !availableTools.find((t) => t.name === toolName)) {
      await this.sendError(
        (request as any).id,
        ErrorCode.InvalidParams,
        `Tool '${toolName}' not found on upstream server`
      );
      return;
    }

    try {
      // Ensure upstream connection is established
      await this.ensureUpstreamConnection();

      this.logger.debug(`Calling upstream tool: ${toolName}`);
      // Forward to upstream using the nice Client API
      const result = await this.upstreamManager.callTool(request.params);

      this.logger.debug(`Tool ${toolName} executed successfully`);
      // Could modify result here if needed
      // For now, just forward it
      await this.sendResult((request as any).id, result);
    } catch (error) {
      // Handle upstream errors
      this.logger.error(`Tool call failed: ${toolName}`, error);

      await this.sendError(
        (request as any).id,
        ErrorCode.InternalError,
        `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async handleKnownRequests(request: JSONRPCRequest) {
    let result: any;
    try {
      // Ensure upstream connection is established
      await this.ensureUpstreamConnection();

      switch (request.method) {
        case 'ping':
          result = await this.upstreamManager.ping();
          break;
        case 'completion/complete':
          result = await this.upstreamManager.complete(request.params);
          break;
        case 'logging/setLevel':
          result = await this.upstreamManager.setLoggingLevel(request.params);
          break;
        case 'prompts/get':
          result = await this.upstreamManager.getPrompt(request.params);
          break;
        case 'prompts/list':
          result = await this.upstreamManager.listPrompts(request.params);
          break;
        case 'resources/list':
          result = await this.upstreamManager.listResources(request.params);
          break;
        case 'resources/templates/list':
          result = await this.upstreamManager.listResourceTemplates(
            request.params
          );
          break;
        case 'resources/read':
          result = await this.upstreamManager.readResource(request.params);
          break;
        case 'resources/subscribe':
          result = await this.upstreamManager.subscribeResource(request.params);
          break;
        case 'resources/unsubscribe':
          result = await this.upstreamManager.unsubscribeResource(
            request.params
          );
          break;
        default:
          result = await this.forwardRequest(request);
          break;
      }

      await this.sendResult((request as any).id, result);
    } catch (error) {
      await this.sendError(
        request.id!,
        ErrorCode.InternalError,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Forward a request directly to upstream
   */
  private async forwardRequest(request: JSONRPCRequest) {
    try {
      // Ensure upstream connection is established
      await this.ensureUpstreamConnection();

      const result = await this.upstreamManager.request(
        request as any,
        EmptyResultSchema
      );

      await this.sendResult((request as any).id, result);
    } catch (error) {
      await this.sendError(
        request.id!,
        ErrorCode.InternalError,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Send a result response to the client
   */
  private async sendResult(id: RequestId, result: any) {
    const response: JSONRPCResponse = {
      jsonrpc: '2.0',
      id,
      result,
    };
    this.logger.debug(`Sending response for request ${id}`, {
      result,
      sessionId: this.downstreamTransport?.sessionId,
    });
    await this.downstreamTransport!.send(response);
  }

  /**
   * Send an error response to the client
   */
  private async sendError(
    id: RequestId,
    code: number,
    message: string,
    data?: any
  ) {
    const response: JSONRPCError = {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        data,
      },
    };
    this.logger.warn(`Sending error response: ${message}`, { id, code });
    await this.downstreamTransport!.send(response);
  }

  /**
   * Handle HTTP request - optimized with direct transport calls
   */
  async handleRequest(req: any, res: any, body?: any) {
    this.lastActivity = Date.now();

    if (!this.downstreamTransport) {
      throw new Error('Session not initialized');
    }

    // Direct transport method calls
    if (this.getClientTransportType() === 'streamable-http') {
      await (
        this.downstreamTransport as StreamableHTTPServerTransport
      ).handleRequest(req, res, body);
    } else if (req.method === 'POST' && body) {
      await (this.downstreamTransport as SSEServerTransport).handlePostMessage(
        req,
        res,
        body
      );
    } else if (req.method === 'GET') {
      // SSE GET requests should not reach here - they should be handled by handleEstablishedSessionGET
      this.logger.error(
        `Unexpected GET request in handleRequest for session ${this.id} with transport ${this.transportCapabilities?.clientTransport}`
      );
      res
        .writeHead(400)
        .end('SSE GET requests should use the dedicated SSE endpoint');
      return;
    } else {
      res.writeHead(405).end('Method not allowed');
    }
  }

  /**
   * Get the downstream transport (for SSE message handling)
   */
  getDownstreamTransport(): Transport | undefined {
    return this.downstreamTransport;
  }

  /**
   * Clean up the session
   */
  async close() {
    this.stateManager.markAsClosed();
    await this.upstreamManager.close();
    await this.downstreamTransport?.close();
  }
}
