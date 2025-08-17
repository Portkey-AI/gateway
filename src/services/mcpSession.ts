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
  isJSONRPCRequest,
  isJSONRPCResponse,
  isJSONRPCError,
  isInitializeRequest,
  ErrorCode,
  RequestId,
  InitializeRequest,
  InitializeResult,
  Tool,
  InitializeResultSchema,
} from '@modelcontextprotocol/sdk/types';
import { ServerConfig } from '../types/mcp';
import { createLogger } from '../utils/logger';

export type TransportType = 'streamable-http' | 'sse';

export interface TransportCapabilities {
  clientTransport: TransportType;
  upstreamTransport: TransportType;
}

/**
 * Session states for explicit state management
 */
enum SessionState {
  NEW = 'new',
  INITIALIZING = 'initializing',
  ACTIVE = 'active',
  DORMANT = 'dormant',
  CLOSED = 'closed',
}

export class MCPSession {
  public id: string; // Remove readonly for session restoration
  public createdAt: number; // Remove readonly for session restoration
  public lastActivity: number;

  private upstreamClient?: Client;
  private upstreamTransport?:
    | StreamableHTTPClientTransport
    | SSEClientTransport;
  private downstreamTransport?:
    | StreamableHTTPServerTransport
    | SSEServerTransport;
  private transportCapabilities?: TransportCapabilities;
  private isInitializing: boolean = false;
  private _isInitialized: boolean = false;
  private isDormantSession: boolean = false;
  private logger;
  private _state: SessionState = SessionState.NEW;

  // Track upstream capabilities for filtering
  private upstreamCapabilities?: any;
  private availableTools?: Tool[];

  // Metrics
  public metrics = {
    requests: 0,
    toolCalls: 0,
    errors: 0,
  };

  // Rate limiting
  private rateLimitWindow: number[] = [];

  constructor(
    public readonly config: ServerConfig,
    private readonly gatewayName: string = 'portkey-mcp-gateway',
    sessionId?: string
  ) {
    this.id = sessionId || crypto.randomUUID();
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.logger = createLogger(`Session:${this.id.substring(0, 8)}`);
  }

  /**
   * Get current session state based on internal conditions
   */
  getState(): SessionState {
    if (this._state === SessionState.CLOSED) return SessionState.CLOSED;

    // Determine state based on current conditions
    if (this.isInitializing) return SessionState.INITIALIZING;
    if (
      this._isInitialized &&
      this.downstreamTransport &&
      this.transportCapabilities
    ) {
      return SessionState.ACTIVE;
    }
    if (this.transportCapabilities && !this._isInitialized) {
      return SessionState.DORMANT;
    }
    return SessionState.NEW;
  }

  /**
   * Initialize or restore session based on current state
   */
  async initializeOrRestore(
    clientTransportType: TransportType
  ): Promise<Transport> {
    const currentState = this.getState();
    this.logger.debug(
      `Current state: ${currentState}, attempting to initialize with ${clientTransportType}`
    );

    switch (currentState) {
      case SessionState.NEW:
        return this.initialize(clientTransportType);

      case SessionState.DORMANT:
        this.logger.info(`Restoring dormant session ${this.id}`);
        this.isDormantSession = true;
        return this.initialize(clientTransportType);

      case SessionState.ACTIVE:
        this.logger.debug('Session already active');
        return this.downstreamTransport!;

      case SessionState.INITIALIZING:
        // Wait for initialization to complete
        this.logger.debug('Waiting for ongoing initialization to complete');
        while (this.isInitializing) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (this.getState() === SessionState.ACTIVE) {
          return this.downstreamTransport!;
        }
        throw new Error('Session initialization failed');

      case SessionState.CLOSED:
        throw new Error('Cannot initialize closed session');

      default:
        throw new Error(`Unknown session state: ${currentState}`);
    }
  }

  /**
   * Initialize the session with transport translation
   */
  async initialize(clientTransportType: TransportType): Promise<Transport> {
    this.logger.debug(`Initializing with ${clientTransportType} transport`);

    // Prevent concurrent initialization
    if (this.isInitializing) {
      this.logger.debug('Initialization already in progress, waiting...');
      // Wait for current initialization to complete
      while (this.isInitializing) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (this.isInitialized()) {
        this.logger.debug('Initialization completed by concurrent call');
        return this.downstreamTransport!;
      }
    }

    this.isInitializing = true;
    try {
      // Try to connect to upstream with best available transport
      this.logger.debug('Connecting to upstream server...');
      const upstreamTransport = await this.connectUpstream();
      this.logger.info(
        `Connected to upstream with ${upstreamTransport} transport`
      );

      // Store transport capabilities for translation
      this.transportCapabilities = {
        clientTransport: clientTransportType,
        upstreamTransport: upstreamTransport,
      };

      this.logger.info(
        `Transport: ${clientTransportType} -> ${upstreamTransport}`
      );

      // Create downstream transport for client
      const transport = this.createDownstreamTransport(clientTransportType);

      // Mark session as fully initialized
      this._isInitialized = true;
      this.isInitializing = false;
      this.logger.debug('Session initialization completed');
      return transport;
    } catch (error) {
      this.logger.error('Session initialization failed', error);
      this.isInitializing = false;
      throw error;
    }
  }

  /**
   * Connect to upstream with automatic transport detection
   * Returns the transport type that was successfully established
   */
  private async connectUpstream(): Promise<TransportType> {
    const upstreamUrl = new URL(this.config.url);
    this.logger.debug(`Connecting to ${this.config.url}`);

    // Try Streamable HTTP first (modern transport)
    try {
      this.logger.debug('Trying Streamable HTTP transport');
      await this.connectUpstreamStreamableHTTP(upstreamUrl);
      return 'streamable-http';
    } catch (error) {
      // Fall back to SSE if Streamable HTTP fails
      this.logger.debug('Streamable HTTP failed, trying SSE', error);
      try {
        await this.connectUpstreamSSE(upstreamUrl);
        return 'sse';
      } catch (sseError) {
        this.logger.error('Both transports failed', {
          streamableHttp: error,
          sse: sseError,
        });
        throw new Error(`Failed to connect to upstream with any transport`);
      }
    }
  }

  /**
   * Connect to upstream using Streamable HTTP
   */
  private async connectUpstreamStreamableHTTP(url: URL) {
    this.upstreamTransport = new StreamableHTTPClientTransport(url, {
      requestInit: {
        headers: this.config.headers,
      },
    });

    this.upstreamClient = new Client({
      name: `${this.gatewayName}-client`,
      version: '1.0.0',
    });

    await this.upstreamClient.connect(this.upstreamTransport);
    await this.fetchUpstreamCapabilities();
  }

  /**
   * Connect to upstream using SSE
   */
  private async connectUpstreamSSE(url: URL) {
    this.upstreamTransport = new SSEClientTransport(url, {
      requestInit: {
        headers: this.config.headers,
      },
    });

    this.upstreamClient = new Client({
      name: `${this.gatewayName}-client`,
      version: '1.0.0',
    });

    await this.upstreamClient.connect(this.upstreamTransport);
    await this.fetchUpstreamCapabilities();
  }

  /**
   * Fetch upstream capabilities
   */
  private async fetchUpstreamCapabilities() {
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
   * Create downstream transport based on client transport type
   * This is independent of upstream transport - we translate between them
   */
  private createDownstreamTransport(
    clientTransportType: TransportType
  ): Transport {
    this.logger.debug(`Creating ${clientTransportType} downstream transport`);

    if (clientTransportType === 'sse') {
      // For SSE clients, create SSE server transport
      this.downstreamTransport = new SSEServerTransport(
        `/messages?sessionId=${this.id}`, // Endpoint for POST messages
        null as any // Response will be set when we handle GET request
      );
    } else {
      // For Streamable HTTP clients, create Streamable HTTP server transport
      this.downstreamTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => this.id,
      });
    }

    // CRITICAL: For dormant sessions being restored, we need to mark the transport as initialized
    // because the client won't send another initialization request
    // Only do this for actual dormant sessions, not new sessions
    if (this.isDormantSession) {
      this.logger.debug('Marking transport as initialized for dormant session');
      if (clientTransportType === 'streamable-http') {
        // Force the transport to be initialized
        (this.downstreamTransport as any)._initialized = true;
        (this.downstreamTransport as any).sessionId = this.id;
      }
    }

    // Set up message handling with transport translation
    this.downstreamTransport.onmessage = async (
      message: JSONRPCMessage,
      extra: any
    ) => {
      await this.handleClientMessage(message, extra);
    };

    return this.downstreamTransport;
  }

  /**
   * Get the transport capabilities (client and upstream)
   */
  getTransportCapabilities(): TransportCapabilities | undefined {
    return this.transportCapabilities;
  }

  /**
   * Check if session is properly initialized
   */
  isInitialized(): boolean {
    return this.getState() === SessionState.ACTIVE;
  }

  /**
   * Check if session has upstream connection (needed for tool calls)
   */
  hasUpstreamConnection(): boolean {
    return !!(this.upstreamClient && this.upstreamTransport);
  }

  /**
   * Check if session can be restored (has saved transport capabilities)
   */
  canBeRestored(): boolean {
    const state = this.getState();
    return (
      state === SessionState.DORMANT ||
      (state === SessionState.NEW && !!this.transportCapabilities)
    );
  }

  /**
   * Check if session is dormant (has metadata but no active connections)
   */
  isDormant(): boolean {
    return this.getState() === SessionState.DORMANT;
  }

  /**
   * Check if session is active
   */
  isActive(): boolean {
    return this.getState() === SessionState.ACTIVE;
  }

  /**
   * Restore session from saved data - only restore basic data, defer full initialization
   */
  async restoreFromData(data: {
    id: string;
    createdAt: number;
    lastActivity: number;
    metrics: any;
    transportCapabilities?: TransportCapabilities;
    clientTransportType?: TransportType;
  }): Promise<void> {
    // Restore basic properties
    this.id = data.id;
    this.createdAt = data.createdAt;
    this.lastActivity = data.lastActivity;
    this.metrics = data.metrics;

    // Store transport capabilities for later use, but don't initialize yet
    if (data.transportCapabilities && data.clientTransportType) {
      this.transportCapabilities = data.transportCapabilities;
      this.isDormantSession = true; // Mark this as a dormant session being restored
      this.logger.info(
        'Session metadata restored, awaiting client reconnection'
      );
    } else {
      this.logger.warn('Session restored but missing transport data');
    }

    // Mark as not initialized since this is just metadata restoration
    this._isInitialized = false;
  }

  /**
   * Ensure upstream connection is established
   */
  async ensureUpstreamConnection(): Promise<void> {
    if (this.hasUpstreamConnection()) {
      return; // Already connected
    }

    try {
      this.logger.debug('Establishing upstream connection...');
      await this.connectUpstream();
      await this.fetchUpstreamCapabilities();
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
    const transport = new SSEServerTransport(`/messages`, res);

    // Set up message handling
    transport.onmessage = async (message: JSONRPCMessage, extra: any) => {
      await this.handleClientMessage(message, extra);
    };

    this.downstreamTransport = transport;
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
   * Handle messages from the client
   */
  private async handleClientMessage(message: JSONRPCMessage, extra?: any) {
    this.lastActivity = Date.now();
    this.metrics.requests++;

    try {
      // Route based on message type
      if (isJSONRPCRequest(message)) {
        await this.handleClientRequest(message as JSONRPCRequest, extra);
      } else if (isJSONRPCResponse(message) || isJSONRPCError(message)) {
        // Responses from client (for sampling/elicitation)
        await this.handleClientResponse(message);
      } else {
        // Notifications - forward to upstream
        await this.forwardNotification(message);
      }
    } catch (error) {
      this.metrics.errors++;

      // Send error response if this was a request
      if (isJSONRPCRequest(message) && 'id' in message) {
        await this.sendError(
          (message as JSONRPCRequest).id,
          ErrorCode.InternalError,
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  }

  /**
   * Handle requests from the client
   */
  private async handleClientRequest(request: any, extra?: any) {
    const { method, params, id } = request;
    this.logger.debug(`Request: ${method}`, { id });

    // Log the request if configured
    if (this.config.tools?.logCalls) {
      this.logger.info(`Tool call: ${method}`, params);
    }

    switch (method) {
      case 'initialize':
        await this.handleInitialize(request as InitializeRequest);
        break;

      case 'tools/list':
        await this.handleToolsList(request as ListToolsRequest);
        break;

      case 'tools/call':
        await this.handleToolCall(request as CallToolRequest);
        break;

      default:
        this.logger.debug(`Forwarding request: ${method}`);
        // Forward all other requests directly to upstream
        await this.forwardRequest(request);
        break;
    }
  }

  /**
   * Handle initialization request
   */
  private async handleInitialize(request: InitializeRequest) {
    this.logger.debug('Processing initialize request');

    // Don't forward initialization to upstream - upstream is already connected
    // Instead, respond with our gateway's capabilities based on upstream
    const gatewayResult: InitializeResult = {
      protocolVersion: request.params.protocolVersion,
      capabilities: {
        // Use cached upstream capabilities or default ones
        ...this.upstreamCapabilities,
        // Could add gateway-specific capabilities here
      },
      serverInfo: {
        name: 'portkey-mcp-gateway',
        version: '1.0.0',
      },
    };

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
        this.upstreamClient!.listTools(),
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
      this.logger.info(
        `Filtered tools: ${tools.length} of ${upstreamResult.tools.length} available`
      );
    }

    // Send filtered result
    await this.sendResult((request as any).id, { tools });
  }

  /**
   * Handle tools/call request with validation and rate limiting
   */
  private async handleToolCall(request: CallToolRequest) {
    const toolName = request.params.name;
    this.logger.debug(`Tool call: ${toolName}`);

    // Check rate limiting
    if (!this.checkRateLimit()) {
      this.logger.warn(`Rate limit exceeded for tool: ${toolName}`);
      await this.sendError(
        (request as any).id,
        ErrorCode.InvalidRequest,
        'Rate limit exceeded. Please try again later.'
      );
      return;
    }

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
    if (
      this.availableTools &&
      !this.availableTools.find((t) => t.name === toolName)
    ) {
      await this.sendError(
        (request as any).id,
        ErrorCode.InvalidParams,
        `Tool '${toolName}' not found on upstream server`
      );
      return;
    }

    // Track metrics
    this.metrics.toolCalls++;

    try {
      // Ensure upstream connection is established
      await this.ensureUpstreamConnection();

      this.logger.debug(`Calling upstream tool: ${toolName}`);
      // Forward to upstream using the nice Client API
      const result = await this.upstreamClient!.callTool(request.params);

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

  /**
   * Forward a request directly to upstream
   */
  private async forwardRequest(request: JSONRPCRequest) {
    try {
      // Ensure upstream connection is established
      await this.ensureUpstreamConnection();

      const result = await this.upstreamClient!.request(
        request as any,
        {} as any // Use generic schema for unknown requests
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
   * Forward a notification to upstream
   */
  private async forwardNotification(message: JSONRPCMessage) {
    await this.upstreamClient!.notification(message as any);
  }

  /**
   * Handle responses from client (for sampling/elicitation from upstream)
   */
  private async handleClientResponse(message: JSONRPCResponse | JSONRPCError) {
    // For now, just forward to upstream
    // In a full implementation, we'd track pending upstream requests
    await this.upstreamTransport!.send(message);
  }

  /**
   * Check rate limiting
   */
  private checkRateLimit(): boolean {
    if (!this.config.tools?.rateLimit) {
      return true; // No rate limit configured
    }

    const { requests, window } = this.config.tools.rateLimit;
    const now = Date.now();
    const windowStart = now - window * 1000;

    // Remove old entries
    this.rateLimitWindow = this.rateLimitWindow.filter((t) => t > windowStart);

    // Check if we're over the limit
    if (this.rateLimitWindow.length >= requests) {
      return false;
    }

    // Add current request
    this.rateLimitWindow.push(now);
    return true;
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
    this.logger.debug(`Sending response for request ${id}`);
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
   * Handle HTTP request through the transport
   */
  /**
   * Handle HTTP request - routes to appropriate transport handler based on CLIENT transport
   */
  async handleRequest(req: any, res: any, body?: any) {
    this.lastActivity = Date.now();

    if (!this.downstreamTransport || !this.transportCapabilities) {
      this.logger.error('Session not initialized');
      throw new Error('Session not initialized');
    }

    const clientTransport = this.transportCapabilities.clientTransport;

    if (clientTransport === 'streamable-http') {
      // Client is using Streamable HTTP
      const transport = this
        .downstreamTransport as StreamableHTTPServerTransport;

      try {
        await transport.handleRequest(req, res, body);
      } catch (error: any) {
        this.logger.error('Transport error', error);
        throw error;
      }
    } else {
      // Client is using SSE
      if (req.method === 'GET') {
        // For SSE GET requests, we need to set up the stream
        // This should be handled by the main handler, not here
        this.logger.error('SSE GET request reached handleRequest');
        throw new Error('SSE GET should be handled by dedicated SSE endpoint');
      } else if (req.method === 'POST' && body) {
        // Handle POST message for SSE - the transport translation happens in message handling
        const transport = this.downstreamTransport as SSEServerTransport;
        await transport.handlePostMessage(req, res, body);
      } else {
        this.logger.warn(`Invalid SSE request: ${req.method}`);
        res.writeHead(405).end('Method not allowed');
      }
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
    this._state = SessionState.CLOSED;
    await this.upstreamClient?.close();
    await this.downstreamTransport?.close();
  }
}
