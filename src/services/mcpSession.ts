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
} from '@modelcontextprotocol/sdk/types';
import { ServerConfig } from '../types/mcp';
import { createLogger } from '../utils/logger';

export type TransportType = 'streamable-http' | 'sse';

export interface TransportCapabilities {
  clientTransport: TransportType;
  upstreamTransport: TransportType;
}

/**
 * Performance-optimized session states using bit flags for fast checks
 */
const enum SessionStateFlags {
  NONE = 0,
  INITIALIZING = 1 << 0,
  INITIALIZED = 1 << 1,
  DORMANT = 1 << 2,
  CLOSED = 1 << 3,
  HAS_UPSTREAM = 1 << 4,
  HAS_DOWNSTREAM = 1 << 5,
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

  // State as bit flags for fast checking
  private stateFlags: SessionStateFlags = SessionStateFlags.NONE;

  private logger;

  // Track upstream capabilities for filtering
  private upstreamCapabilities?: any;
  private availableTools?: Tool[];

  // Metrics
  public metrics = {
    requests: 0,
    toolCalls: 0,
    errors: 0,
  };

  // Rate limiting with pre-allocated array
  private rateLimitWindow: number[] = [];
  private rateLimitCursor = 0;

  constructor(
    public readonly config: ServerConfig,
    private readonly gatewayName: string = 'portkey-mcp-gateway',
    sessionId?: string
  ) {
    this.id = sessionId || crypto.randomUUID();
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.logger = createLogger(`Session:${this.id.substring(0, 8)}`);

    // Pre-allocate rate limit array if configured
    if (config.tools?.rateLimit) {
      this.rateLimitWindow = new Array(config.tools.rateLimit.requests);
      this.rateLimitWindow.fill(0);
    }
  }

  /**
   * Fast state checks using bit operations
   */
  get isInitializing(): boolean {
    return (this.stateFlags & SessionStateFlags.INITIALIZING) !== 0;
  }

  get isInitialized(): boolean {
    return (this.stateFlags & SessionStateFlags.INITIALIZED) !== 0;
  }

  get isClosed(): boolean {
    return (this.stateFlags & SessionStateFlags.CLOSED) !== 0;
  }

  get isDormantSession(): boolean {
    return (this.stateFlags & SessionStateFlags.DORMANT) !== 0;
  }

  set isDormantSession(value: boolean) {
    if (value) {
      this.stateFlags |= SessionStateFlags.DORMANT;
    } else {
      this.stateFlags &= ~SessionStateFlags.DORMANT;
    }
  }

  /**
   * Get current session state as a string (for debugging/logging)
   */
  getState(): string {
    if (this.isClosed) return 'closed';
    if (this.isInitializing) return 'initializing';
    if (this.isActive()) return 'active';
    if (this.isDormant()) return 'dormant';
    return 'new';
  }

  /**
   * Initialize or restore session - optimized with direct state checks
   */
  async initializeOrRestore(
    clientTransportType: TransportType
  ): Promise<Transport> {
    // Fast path: already active
    if (this.isActive() && this.downstreamTransport) {
      return this.downstreamTransport;
    }

    // Fast path: closed
    if (this.isClosed) {
      throw new Error('Cannot initialize closed session');
    }

    // Handle initializing state
    if (this.isInitializing) {
      // Simple spin wait with yield
      while (this.isInitializing) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      if (this.downstreamTransport) {
        return this.downstreamTransport;
      }
      throw new Error('Session initialization failed');
    }

    // Initialize new or dormant session
    const wasDormant = this.isDormant();
    if (wasDormant) {
      this.logger.info(`Restoring dormant session ${this.id}`);
      this.isDormantSession = true;
    }

    return this.initialize(clientTransportType);
  }

  /**
   * Initialize the session - optimized for minimal allocations
   */
  async initialize(clientTransportType: TransportType): Promise<Transport> {
    this.logger.debug(`Initializing with ${clientTransportType} transport`);

    // Prevent concurrent initialization
    if (this.isInitializing) {
      this.logger.debug('Initialization already in progress, waiting...');
      // Wait for current initialization to complete
      while (this.isInitializing) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      if (this.isInitialized) {
        this.logger.debug('Initialization completed by concurrent call');
        return this.downstreamTransport!;
      }
    }

    this.stateFlags |= SessionStateFlags.INITIALIZING;
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
      this.stateFlags |= SessionStateFlags.INITIALIZED;
      this.stateFlags &= ~SessionStateFlags.INITIALIZING;
      this.logger.debug('Session initialization completed');
      return transport;
    } catch (error) {
      this.logger.error('Session initialization failed', error);
      this.stateFlags &= ~SessionStateFlags.INITIALIZING;
      throw error;
    }
  }

  /**
   * Connect to upstream - optimized with inline transport creation
   */
  private async connectUpstream(): Promise<TransportType> {
    const upstreamUrl = new URL(this.config.url);
    this.logger.debug(`Connecting to ${this.config.url}`);

    // Try Streamable HTTP first (most common)
    try {
      this.logger.debug('Trying Streamable HTTP transport');
      this.upstreamTransport = new StreamableHTTPClientTransport(upstreamUrl, {
        requestInit: {
          headers: this.config.headers,
        },
      });

      this.upstreamClient = new Client({
        name: `${this.gatewayName}-client`,
        version: '1.0.0',
      });

      await this.upstreamClient.connect(this.upstreamTransport);
      this.stateFlags |= SessionStateFlags.HAS_UPSTREAM;

      // Fetch capabilities synchronously during initialization
      await this.fetchUpstreamCapabilities();

      return 'streamable-http';
    } catch (error) {
      // Fall back to SSE
      this.logger.debug('Streamable HTTP failed, trying SSE', error);
      try {
        this.upstreamTransport = new SSEClientTransport(upstreamUrl, {
          requestInit: {
            headers: this.config.headers,
          },
        });

        this.upstreamClient = new Client({
          name: `${this.gatewayName}-client`,
          version: '1.0.0',
        });

        await this.upstreamClient.connect(this.upstreamTransport);
        this.stateFlags |= SessionStateFlags.HAS_UPSTREAM;

        // Fetch capabilities synchronously during initialization
        await this.fetchUpstreamCapabilities();

        this.logger.debug(
          'Upstream capabilities (SSE)',
          this.upstreamCapabilities
        );

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
   * Create downstream transport - optimized with direct creation
   */
  private createDownstreamTransport(
    clientTransportType: TransportType
  ): Transport {
    this.logger.debug(`Creating ${clientTransportType} downstream transport`);

    if (clientTransportType === 'sse') {
      // For SSE clients, create SSE server transport
      this.downstreamTransport = new SSEServerTransport(
        `/messages?sessionId=${this.id}`,
        null as any
      );
    } else {
      // For Streamable HTTP clients, create Streamable HTTP server transport
      this.downstreamTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => this.id,
      });

      // Handle dormant session restoration inline
      if (this.isDormantSession) {
        this.logger.debug(
          'Marking transport as initialized for dormant session'
        );
        (this.downstreamTransport as any)._initialized = true;
        (this.downstreamTransport as any).sessionId = this.id;
      }
    }

    // Set message handler directly
    this.downstreamTransport.onmessage = this.handleClientMessage.bind(this);

    this.stateFlags |= SessionStateFlags.HAS_DOWNSTREAM;
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
    return (this.stateFlags & SessionStateFlags.HAS_UPSTREAM) !== 0;
  }

  /**
   * Check if session can be restored (has saved transport capabilities)
   */
  canBeRestored(): boolean {
    return (
      this.isDormant() || (!this.isInitialized && !!this.transportCapabilities)
    );
  }

  /**
   * Check if session is dormant (has metadata but no active connections)
   */
  isDormant(): boolean {
    return (
      (this.stateFlags & SessionStateFlags.DORMANT) !== 0 ||
      (!!this.transportCapabilities &&
        !this.isInitialized &&
        !this.hasUpstreamConnection())
    );
  }

  /**
   * Check if session is active - optimized with bit checks
   */
  isActive(): boolean {
    return (
      (this.stateFlags &
        (SessionStateFlags.INITIALIZED |
          SessionStateFlags.HAS_DOWNSTREAM |
          SessionStateFlags.HAS_UPSTREAM)) ===
      (SessionStateFlags.INITIALIZED |
        SessionStateFlags.HAS_DOWNSTREAM |
        SessionStateFlags.HAS_UPSTREAM)
    );
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

    // Mark as dormant since this is just metadata restoration
    this.stateFlags |= SessionStateFlags.DORMANT;
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
   * Handle client message - optimized hot path
   */
  private async handleClientMessage(message: any, extra?: any) {
    this.lastActivity = Date.now();
    this.metrics.requests++;

    try {
      // Fast type check using property existence
      if ('method' in message && 'id' in message) {
        // It's a request - handle directly without type checking functions
        await this.handleClientRequest(message, extra);
      } else if ('result' in message || 'error' in message) {
        // It's a response - forward directly
        await this.upstreamTransport!.send(message);
      } else if ('method' in message) {
        // It's a notification - forward directly
        await this.upstreamClient!.notification(message);
      }
    } catch (error) {
      this.metrics.errors++;

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

    // Direct method handling without switch overhead for hot paths
    if (method === 'tools/call') {
      // Most common operation - handle first
      if (this.config.tools?.logCalls) {
        this.logger.info(`Tool call: ${method}`, request.params);
      }
      await this.handleToolCall(request);
    } else if (method === 'tools/list') {
      await this.handleToolsList(request);
    } else if (method === 'initialize') {
      await this.handleInitialize(request);
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
    const gatewayResult: InitializeResult = {
      protocolVersion: request.params.protocolVersion,
      capabilities: {
        // Use cached upstream capabilities or default ones
        ...this.upstreamCapabilities,
        // Add tools capability if we have tools available
        tools:
          this.availableTools && this.availableTools.length > 0
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
   * Optimized rate limiting with circular buffer
   */
  private checkRateLimit(): boolean {
    const config = this.config.tools?.rateLimit;
    if (!config) return true;

    const now = Date.now();
    const windowStart = now - config.window * 1000;

    // Count valid entries in circular buffer
    let validCount = 0;
    for (let i = 0; i < this.rateLimitWindow.length; i++) {
      if (this.rateLimitWindow[i] > windowStart) validCount++;
    }

    if (validCount >= config.requests) return false;

    // Add new entry using circular buffer
    this.rateLimitWindow[this.rateLimitCursor] = now;
    this.rateLimitCursor =
      (this.rateLimitCursor + 1) % this.rateLimitWindow.length;

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
   * Handle HTTP request - optimized with direct transport calls
   */
  async handleRequest(req: any, res: any, body?: any) {
    this.lastActivity = Date.now();

    if (!this.downstreamTransport) {
      throw new Error('Session not initialized');
    }

    // Direct transport method calls
    if (this.transportCapabilities?.clientTransport === 'streamable-http') {
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
      // SSE GET should be handled by dedicated endpoint
      throw new Error('SSE GET should be handled by dedicated SSE endpoint');
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
    this.stateFlags |= SessionStateFlags.CLOSED;
    await this.upstreamClient?.close();
    await this.downstreamTransport?.close();
  }
}
