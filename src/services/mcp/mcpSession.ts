/**
 * @file src/services/mcpSession.ts
 * MCP session that bridges client and upstream server
 */

import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  JSONRPCRequest,
  CallToolRequest,
  ListToolsRequest,
  ErrorCode,
  InitializeRequest,
  InitializeResult,
  Tool,
  EmptyResultSchema,
  isJSONRPCRequest,
  isJSONRPCError,
  isJSONRPCResponse,
  isJSONRPCNotification,
} from '@modelcontextprotocol/sdk/types.js';
import { ServerConfig, ServerTransport, TransportTypes } from '../../types/mcp';
import { createLogger } from '../../utils/logger';
import { Context } from 'hono';
import { ConnectResult, Upstream } from './upstream';
import { Downstream } from './downstream';
import { emitLog } from '../../middlewares/log/emitLog';

export type TransportType = 'http' | 'sse' | 'auth-required';

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

  private transportCapabilities?: TransportCapabilities;

  private upstream: Upstream;
  private downstream: Downstream;

  private logger;

  // Session expiration tied to token lifecycle
  private tokenExpiresAt?: number;

  public readonly config: ServerConfig;
  public readonly gatewayToken?: any;
  public upstreamSessionId?: string;

  private context?: Context;

  private status: SessionStatus = SessionStatus.New;

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
    this.downstream = new Downstream({
      sessionId: this.id,
      onMessageHandler: this.handleClientMessage.bind(this),
    });
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
    if (this.isActive()) return this.downstream.transport!;
    if (this.isClosed) throw new Error('Cannot initialize closed session');

    // Handle initializing state
    if (this.isInitializing) {
      await this.waitForInitialization();
      if (!this.downstream.transport)
        throw new Error('Session initialization failed');
      return this.downstream.transport;
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
    return this.downstream.create(type as TransportTypes);
  }

  /**
   * Initialize SSE transport with response object
   */
  initializeSSETransport(res: any): SSEServerTransport {
    this.downstream.create('sse');
    this.id = this.downstream.transport!.sessionId!;
    return this.downstream.transport as SSEServerTransport;
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
  getDownstreamTransport = () => this.downstream.transport;

  /**
   * Check if session has upstream connection (needed for tool calls)
   */
  hasUpstreamConnection(): boolean {
    return this.upstream.connected;
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
      this.downstream.connected
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
        await this.downstream?.sendError(
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
      await this.downstream.sendAuthError(request.id, {
        serverId: this.config.serverId,
        workspaceId: this.config.workspaceId,
        authorizationUrl: this.upstream.pendingAuthURL,
      });
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
   * Handle initialization request
   */
  private async handleInitialize(request: InitializeRequest) {
    this.logger.debug(
      'Processing initialize request',
      this.upstream.serverCapabilities
    );

    const result: InitializeResult = {
      protocolVersion: request.params.protocolVersion,
      capabilities: this.upstream.serverCapabilities,
      serverInfo: {
        name: 'portkey-mcp-gateway',
        version: '1.0.0',
      },
    };

    this.logger.debug(
      `Sending initialize response with tools: ${!!result.capabilities.tools}`
    );
    // Send gateway response
    await this.downstream.sendResult((request as any).id, result);
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

      await this.downstream.sendResult((request as any).id, { tools });
    } catch (error) {
      this.logger.error('Failed to get tools', error);
      await this.downstream.sendError(
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
      await this.downstream.sendError(
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
      await this.downstream.sendResult((request as any).id, result);
      this.logResult(request, result);
    } catch (error) {
      // Handle upstream errors
      this.logger.error(`Tool call failed: ${toolName}`, error);

      await this.downstream.sendError(
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
        await this.downstream.sendResult((request as any).id, result);
      } else {
        await this.forwardRequest(request);
        return;
      }
    } catch (error) {
      await this.downstream.sendError(
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

      await this.downstream.sendResult((request as any).id, result);
    } catch (error) {
      await this.downstream.sendError(
        request.id!,
        ErrorCode.InternalError,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Handle HTTP request
   */
  async handleRequest() {
    this.lastActivity = Date.now();
    let body: any;

    const { incoming: req, outgoing: res } = this.context?.env as any;

    if (req.method === 'POST') {
      body = await this.context?.req.json();
    }

    // if (res?.setHeader) res.setHeader(HEADER_MCP_SESSION_ID, this.id);

    await this.downstream.handleRequest(req, res, body);
  }

  async logRequest(request?: JSONRPCRequest) {
    try {
      const method = request?.method ?? 'unknown';
      const isToolCall = method === 'tools/call';

      const reqId = (request?.id ?? '').toString();
      const toolName = isToolCall
        ? (request as any)?.params?.name ?? undefined
        : undefined;

      const attrs: Record<string, string> = {
        'mcp.server.id': this.config.serverId,
        'mcp.workspace.id': this.config.workspaceId,

        'mcp.transport.client': this.getClientTransportType() ?? '',
        'mcp.transport.upstream': this.getUpstreamTransportType() ?? '',

        'mcp.request.method': method,
        'mcp.request.id': reqId,
      };

      if (toolName) {
        attrs['mcp.tool.name'] = toolName;
        attrs['mcp.tool.params'] = JSON.stringify(request?.params ?? {});
      }
    } catch (error) {
      this.logger.error('Failed to log request', error);
    }
  }

  async logResult(
    request: any,
    result: unknown,
    outcome?: {
      ok: boolean;
      error?: any;
      durationMs?: number;
    }
  ) {
    try {
      const method = request?.method ?? 'unknown';
      const isToolCall = method === 'tools/call';

      const reqId = (request?.id ?? '').toString();
      const toolName = isToolCall
        ? (request as any)?.params?.name ?? undefined
        : undefined;

      const attrs: Record<string, any> = {
        'mcp.server.id': this.config.serverId,
        'mcp.workspace.id': this.config.workspaceId,

        'mcp.transport.client': this.getClientTransportType() ?? '',
        'mcp.transport.upstream': this.getUpstreamTransportType() ?? '',

        'mcp.request.method': method,
        'mcp.request.id': reqId,
      };

      if (toolName) {
        attrs['mcp.tool.name'] = toolName;
        console.log(
          'arguments',
          typeof (request as CallToolRequest)?.params?.arguments,
          (request as CallToolRequest)?.params?.arguments
        );
        attrs['mcp.tool.params'] =
          (request as CallToolRequest)?.params?.arguments ?? {};
        attrs['mcp.tool.result'] = result ?? {};
      } else {
        attrs['mcp.result'] = result ?? {};
      }

      if (outcome?.ok) {
        attrs['mcp.request.success'] = 'true';
        attrs['mcp.request.duration_ms'] =
          outcome?.durationMs?.toString() ?? '';
      } else {
        attrs['mcp.request.success'] = 'false';
        attrs['mcp.request.error'] = outcome?.error
          ? (outcome.error as Error)?.message ?? 'Unknown error'
          : 'Unknown error';
      }

      emitLog({ type: 'mcp.request' }, attrs);
    } catch (error) {
      this.logger.error('Failed to log result', error);
    }
  }

  /**
   * Clean up the session
   */
  async close() {
    this.status = SessionStatus.Closed;
    await this.upstream.close();
    await this.downstream.close();
  }
}
