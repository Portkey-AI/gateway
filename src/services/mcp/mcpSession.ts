/**
 * @file src/services/mcpSession.ts
 * MCP session that bridges client and upstream server
 */

import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  JSONRPCRequest,
  CallToolRequest,
  ListToolsRequest,
  ErrorCode,
  RequestId,
  InitializeRequest,
  InitializeResult,
  Tool,
  EmptyResultSchema,
  isJSONRPCRequest,
  isJSONRPCError,
  isJSONRPCResponse,
  isJSONRPCNotification,
} from '@modelcontextprotocol/sdk/types.js';
import { ServerConfig, ServerTransport } from '../../types/mcp';
import { createLogger } from '../../utils/logger';
import { Context } from 'hono';
import { ConnectResult, Upstream } from './upstream';

export type TransportType = 'streamable-http' | 'sse' | 'auth-required';

export interface TransportCapabilities {
  clientTransport: TransportType;
  upstreamTransport: TransportType;
}

export enum SessionStatus {
  New = 'new',
  Initializing = 'initializing',
  Initialized = 'initialized',
  Dormant = 'dormant',
  Closed = 'closed',
}

export class MCPSession {
  public id: string;
  public createdAt: number;
  public lastActivity: number;

  private downstreamTransport?: ServerTransport;
  private transportCapabilities?: TransportCapabilities;

  private upstream: Upstream;

  private logger;

  // Session expiration tied to token lifecycle
  private tokenExpiresAt?: number;

  public readonly config: ServerConfig;
  public readonly gatewayToken?: any;
  public upstreamSessionId?: string;

  private context?: Context;

  private status: SessionStatus = SessionStatus.New;
  private hasDownstream: boolean = false;

  constructor(options: {
    config: ServerConfig;
    sessionId?: string;
    gatewayToken?: any;
    upstreamSessionId?: string;
    context?: Context;
  }) {
    this.config = options.config;
    this.gatewayToken = options.gatewayToken;
    this.id = options.sessionId || crypto.randomUUID();
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.logger = createLogger(`Session:${this.id.substring(0, 8)}`);
    this.upstreamSessionId = options.upstreamSessionId;
    this.context = options.context;
    this.upstream = new Upstream(
      this.config,
      this.gatewayToken?.username || '',
      this.logger,
      this.upstreamSessionId,
      this.context?.get('controlPlane')
    );
    this.setTokenExpiration(options.gatewayToken);
  }

  /**
   * Simple state checks
   */
  get isInitializing(): boolean {
    return this.status === SessionStatus.Initializing;
  }

  get isInitialized(): boolean {
    return this.status === SessionStatus.Initialized;
  }

  get isClosed(): boolean {
    return this.status === SessionStatus.Closed;
  }

  get isDormantSession(): boolean {
    return this.status === SessionStatus.Dormant;
  }

  set isDormantSession(value: boolean) {
    if (value) {
      this.status = SessionStatus.Dormant;
    } else if (this.status === SessionStatus.Dormant) {
      // Only change from dormant if we're currently dormant
      this.status = SessionStatus.New;
    }
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
      await this.waitForInitialization();
      if (!this.downstreamTransport)
        throw new Error('Session initialization failed');
      return this.downstreamTransport;
    }

    clientTransportType ??= this.getClientTransportType();

    return this.initialize(clientTransportType!);
  }

  /**
   * Initialize the session
   */
  private async initialize(
    clientTransportType: TransportType
  ): Promise<Transport> {
    this.status = SessionStatus.Initializing;

    try {
      const upstream: ConnectResult = await this.upstream.connect();

      if (!upstream.ok) {
        // TODO: handle case when upstream needs authorization
        throw new Error('Failed to connect to upstream');
      }

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

      this.status = SessionStatus.Initialized;
      this.logger.debug('Session initialization completed');
      return transport;
    } catch (error) {
      this.logger.error('Session initialization failed', error);
      this.status = SessionStatus.New; // Reset to new state on failure
      throw error;
    }
  }

  /**
   * Wait for ongoing initialization
   */
  private async waitForInitialization(timeout = 30000): Promise<void> {
    const startTime = Date.now();
    while (this.isInitializing && Date.now() - startTime < timeout) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (this.isInitializing) throw new Error('Session initialization timeout');
  }

  /**
   * Create downstream transport
   */
  private createDownstreamTransport(type: TransportType): ServerTransport {
    this.logger.debug(`Creating ${type} downstream transport`);

    if (type === 'sse') {
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
    }

    // Set message handler directly
    this.downstreamTransport.onmessage = this.handleClientMessage.bind(this);
    this.hasDownstream = true;
    return this.downstreamTransport;
  }

  /**
   * Initialize SSE transport with response object
   */
  initializeSSETransport(res: any): SSEServerTransport {
    const transport = new SSEServerTransport(
      `${this.config.workspaceId}/${this.config.serverId}/messages`,
      res
    );

    transport.onmessage = this.handleClientMessage.bind(this);

    this.downstreamTransport = transport;
    this.id = transport.sessionId;
    this.hasDownstream = true;
    return transport;
  }

  /**
   * Get the transport capabilities (client and upstream)
   */
  getTransportCapabilities = () => this.transportCapabilities;

  /**
   * Get the client transport type
   */
  getClientTransportType = () => this.transportCapabilities?.clientTransport;

  /**
   * Get the upstream transport type
   */
  getUpstreamTransportType = () =>
    this.transportCapabilities?.upstreamTransport;

  /**
   * Get the downstream transport (for SSE message handling)
   */
  getDownstreamTransport = () => this.downstreamTransport;

  /**
   * Check if session has upstream connection (needed for tool calls)
   */
  hasUpstreamConnection(): boolean {
    return this.upstream.connected;
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
   * Check if session is dormant (has metadata but no active connections)
   */
  isDormant(): boolean {
    return (
      this.status === SessionStatus.Dormant ||
      (!!this.transportCapabilities &&
        !this.isInitialized &&
        !this.hasUpstreamConnection())
    );
  }

  /**
   * Check if session is active
   */
  isActive(): boolean {
    return (
      this.upstream.connected &&
      this.status === SessionStatus.Initialized &&
      this.hasDownstream
    );
  }

  /**
   * Check if session needs upstream auth
   */
  needsUpstreamAuth(): boolean {
    return this.upstream.pendingAuthURL !== undefined;
  }

  /**
   * Check if a method requires upstream connection
   */
  isUpstreamMethod(method: string): boolean {
    // These methods can be handled locally without upstream
    const localMethods = ['logs/list'];
    return !localMethods.includes(method);
  }

  /**
   * Set token expiration for session lifecycle management
   * Session will be considered expired when token expires
   */
  setTokenExpiration(tokenInfo: any): void {
    if (tokenInfo?.exp) {
      // Token expiration is in seconds, convert to milliseconds
      this.tokenExpiresAt = tokenInfo.exp * 1000;
    } else if (tokenInfo?.expires_in) {
      // Relative expiration in seconds
      this.tokenExpiresAt = Date.now() + tokenInfo.expires_in * 1000;
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
    Object.assign(this, {
      id: data.id,
      createdAt: data.createdAt,
      lastActivity: data.lastActivity,
      upstreamSessionId: data.upstreamSessionId,
      tokenExpiresAt: data.tokenExpiresAt,
      transportCapabilities: data.transportCapabilities,
      clientTransportType: data.clientTransportType,
      status: SessionStatus.Dormant,
    });
  }

  /**
   * Ensure upstream connection is established
   */
  async ensureUpstreamConnection(): Promise<void> {
    if (this.hasUpstreamConnection()) return;

    const upstream: ConnectResult = await this.upstream.connect();
    if (!upstream.ok) {
      // TODO: handle case when upstream needs authorization
      throw new Error('Failed to connect to upstream');
    }
    this.upstreamSessionId = upstream.sessionId;
    this.logger.debug('Upstream connection established');
  }

  /**
   * Handle client message - optimized hot path.
   * Comes here when there's a message on downstreamTransport
   */
  private async handleClientMessage(message: any, extra?: any) {
    this.lastActivity = Date.now();

    try {
      if (isJSONRPCRequest(message)) {
        // It's a request - handle directly
        await this.handleClientRequest(message, extra);
      } else if (isJSONRPCResponse(message) || isJSONRPCError(message)) {
        // It's a response - forward directly
        await this.upstream.send(message);
      } else if (isJSONRPCNotification(message)) {
        // It's a notification - forward directly
        await this.upstream.notification(message);
      }
    } catch (error) {
      // Send error response if this was a request
      if (isJSONRPCRequest(message)) {
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
    const { method } = request;

    // Check if we need upstream auth for any upstream-dependent operations
    if (this.needsUpstreamAuth() && this.isUpstreamMethod(method)) {
      await this.sendAuthError(request.id);
      return;
    }

    // Route to appropriate handler
    const handlers: Record<string, () => Promise<void>> = {
      'tools/call': () => this.handleToolCall(request),
      'tools/list': () => this.handleToolsList(request),
      initialize: () => this.handleInitialize(request),
    };

    const handler = handlers[method];

    // Direct method handling without switch overhead for hot paths
    if (handler) {
      await handler();
    } else if (this.upstream.isKnownRequest(method)) {
      await this.handleKnownRequests(request);
    } else {
      await this.forwardRequest(request);
    }
  }

  /**
   * Send auth error response
   */
  private async sendAuthError(requestId: RequestId) {
    await this.sendError(
      requestId,
      ErrorCode.InternalError,
      `Server ${this.config.serverId} requires authorization. Please complete the OAuth flow: ${this.upstream.pendingAuthURL}`,
      {
        needsAuth: true,
        serverId: this.config.serverId,
        authorizationUrl: this.upstream.pendingAuthURL,
      }
    );
  }

  /**
   * Handle initialization request
   */
  private async handleInitialize(request: InitializeRequest) {
    this.logger.debug('Processing initialize request');

    const result: InitializeResult = {
      protocolVersion: request.params.protocolVersion,
      capabilities: {
        ...this.upstream.serverCapabilities,
        tools: this.upstream.availableTools?.length ? {} : undefined,
      },
      serverInfo: {
        name: 'portkey-mcp-gateway',
        version: '1.0.0',
      },
    };

    this.logger.debug(
      `Sending initialize response with tools: ${!!result.capabilities.tools}`
    );
    // Send gateway response
    await this.sendResult((request as any).id, result);
  }

  private validateToolAccess(
    toolName: string
  ): 'blocked' | 'not allowed' | 'invalid' | null {
    const { allowed, blocked } = this.config.tools || {};

    if (blocked?.includes(toolName)) {
      return 'blocked';
    }

    if (allowed?.length && !allowed.includes(toolName)) {
      return 'not allowed';
    }

    const exists = this.upstream.availableTools?.find(
      (t) => t.name === toolName
    );
    if (!exists) {
      return 'invalid';
    }

    return null; // Tool is valid
  }

  /**
   * Filter tools based on config
   */
  private filterTools(tools: Tool[]): Tool[] {
    const { allowed, blocked } = this.config.tools || {};
    let filtered = tools;

    if (blocked?.length) {
      filtered = filtered.filter((tool) => !blocked.includes(tool.name));
    }

    if (allowed?.length) {
      filtered = filtered.filter((tool) => allowed.includes(tool.name));
    }

    return filtered;
  }

  /**
   * Handle `tools/list` with filtering
   */
  private async handleToolsList(request: ListToolsRequest) {
    this.logger.debug('Fetching upstream tools');

    try {
      await this.ensureUpstreamConnection();

      const upstreamResult = await this.upstream.listTools();
      const tools = this.filterTools(upstreamResult.tools);
      this.logger.debug(`Received ${tools.length} tools`);

      await this.sendResult((request as any).id, { tools });
    } catch (error) {
      this.logger.error('Failed to get tools', error);
      await this.sendError(
        (request as any).id,
        ErrorCode.InternalError,
        `Failed to get tools: ${error instanceof Error ? error.message : String(error)}`
      );
      return;
    }
  }

  /**
   * Handle tools/call request with validation
   */
  private async handleToolCall(request: CallToolRequest) {
    const { name: toolName } = request.params;

    this.logger.debug(`Tool call: ${toolName}`);

    const validationError = this.validateToolAccess(toolName);

    if (validationError) {
      await this.sendError(
        (request as any).id,
        ErrorCode.InvalidParams,
        `Tool '${toolName}' is ${validationError}`
      );
      return;
    }

    try {
      await this.ensureUpstreamConnection();

      const result = await this.upstream.callTool(request.params);

      this.logger.debug(`Tool ${toolName} executed successfully`);

      // This is where the guardrails would come in.
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
    try {
      await this.ensureUpstreamConnection();

      const methodHandlers: Record<string, () => Promise<any>> = {
        ping: () => this.upstream.ping(),
        'completion/complete': () => this.upstream.complete(request.params),
        'logging/setLevel': () => this.upstream.setLoggingLevel(request.params),
        'prompts/get': () => this.upstream.getPrompt(request.params),
        'prompts/list': () => this.upstream.listPrompts(request.params),
        'resources/list': () => this.upstream.listResources(request.params),
        'resources/templates/list': () =>
          this.upstream.listResourceTemplates(request.params),
        'resources/read': () => this.upstream.readResource(request.params),
        'resources/subscribe': () =>
          this.upstream.subscribeResource(request.params),
        'resources/unsubscribe': () =>
          this.upstream.unsubscribeResource(request.params),
      };

      const handler = methodHandlers[request.method];

      if (handler) {
        const result = await handler();
        await this.sendResult((request as any).id, result);
      } else {
        await this.forwardRequest(request);
        return;
      }
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

      const result = await this.upstream.request(
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
   * Send a result response to the downstream client
   */
  private async sendResult(id: RequestId, result: any) {
    this.logger.debug(`Sending response for request ${id}`, {
      result,
      sessionId: this.downstreamTransport?.sessionId,
    });
    await this.downstreamTransport!.send({
      jsonrpc: '2.0',
      id,
      result,
    });
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
    this.logger.warn(`Sending error response: ${message}`, { id, code });
    await this.downstreamTransport!.send({
      jsonrpc: '2.0',
      id,
      error: { code, message, data },
    });
  }

  /**
   * Handle HTTP request
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
      res
        .writeHead(400)
        .end('SSE GET requests should use dedicated SSE endpoint');
      return;
    } else {
      res.writeHead(405).end('Method not allowed');
    }
  }

  /**
   * Clean up the session
   */
  async close() {
    this.status = SessionStatus.Closed;
    await this.upstream.close();
    await this.downstreamTransport?.close();
  }
}
