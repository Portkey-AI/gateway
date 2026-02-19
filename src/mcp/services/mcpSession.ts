/**
 * @file src/services/mcpSession.ts
 * MCP session that bridges client and upstream server
 */

import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
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
  SUPPORTED_PROTOCOL_VERSIONS,
  LATEST_PROTOCOL_VERSION,
} from '@modelcontextprotocol/sdk/types.js';
import { ServerConfig, ServerTransport, TransportTypes } from '../types/mcp';
import { createLogger } from '../../shared/utils/logger';
import { Context } from 'hono';
import { ConnectResult, Upstream } from './upstream';
import { Downstream } from './downstream';
import { emitLog } from '../utils/emitLog';
import { env } from 'hono/adapter';
import { getConnectionPool } from './upstreamConnectionPool';
import { isConnectionError } from '../utils/connectionErrors';
import {
  isCapabilityDisabled,
  filterDisabledCapabilities,
  CapabilityType,
} from './mcpAccessService';
import { ControlPlane } from '../middleware/controlPlane';

// Note: SSE downstream support was removed - gateway only supports HTTP Streamable for clients
export type TransportType = 'http' | 'auth-required';

export interface TransportCapabilities {
  clientTransport: TransportType;
  upstreamTransport: TransportTypes; // Upstream can be 'http' or 'sse'
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

  // Connection pool key for this session (used for marking unhealthy on errors)
  private poolKey?: string;

  constructor(options: {
    config: ServerConfig;
    sessionId?: string;
    gatewayToken?: any;
    upstreamSessionId?: string;
    context?: Context;
    /** Pre-connected upstream (from pool or non-pooled) */
    upstream: Upstream;
    /** Pool key (empty string for non-pooled connections) */
    poolKey: string;
  }) {
    this.config = options.config;
    this.gatewayToken = options.gatewayToken;
    this.id = options.sessionId || crypto.randomUUID();
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.logger = createLogger(`Session:${this.id.substring(0, 8)}`);
    this.upstreamSessionId = options.upstreamSessionId;
    this.context = options.context;
    this.poolKey = options.poolKey;
    this.upstream = options.upstream;

    // NOTE: Dynamic headers (trace IDs, etc.) are updated via upstream.updateDynamicHeaders()
    // in mcpHandler.ts for reused pooled connections

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

    clientTransportType ??= this.getClientTransportType() ?? 'http';
    return this.initialize(clientTransportType);
  }

  /**
   * Initialize the session
   */
  private async initialize(
    clientTransportType: TransportType
  ): Promise<Transport> {
    this.status = SessionStatus.Initializing;

    try {
      // Only connect if not already connected (pooled connections are pre-connected)
      if (!this.upstream.connected) {
        const upstream: ConnectResult = await this.upstream.connect();

        if (!upstream.ok) {
          // Handle case when upstream needs authorization
          throw new Error('Failed to connect to upstream', { cause: upstream });
        }

        this.upstreamSessionId = upstream.sessionId;
      }

      // Store transport capabilities for translation
      this.transportCapabilities = {
        clientTransport: clientTransportType,
        upstreamTransport: 'http', // Pooled connections use HTTP
      };

      this.logger.debug(`Upstream ready: ${clientTransportType} -> http`);

      // Sync server metadata to control plane (background, non-blocking)
      this.syncServerMetadataToControlPlane();

      // Create downstream transport for client (HTTP only)
      const transport = this.createDownstreamTransport();

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
   * Create downstream transport (HTTP Streamable only)
   */
  private createDownstreamTransport(): ServerTransport {
    this.logger.debug('Creating HTTP downstream transport');
    return this.downstream.create();
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
  private async handleClientMessage(message: any) {
    this.lastActivity = Date.now();

    try {
      if (isJSONRPCRequest(message)) {
        // It's a request - handle directly
        await this.handleClientRequest(message);
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
  private async handleClientRequest(request: any) {
    // eslint-disable-line @typescript-eslint/no-unused-vars
    const { method } = request;

    // Note: User access is already enforced by control plane - if user doesn't have access,
    // the server config won't be returned and request will fail at hydrateContext

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
   * Handle initialization request with proper MCP version negotiation.
   *
   * Per the MCP spec:
   * 1. Client sends initialize with its latest supported protocolVersion
   * 2. Server MUST respond (not error) with:
   *    - The same version if it supports it, OR
   *    - A different version it supports (should be its latest)
   * 3. Client checks if it supports the server's returned version
   *    - If yes: proceed with that version
   *    - If no: disconnect
   */
  private async handleInitialize(request: InitializeRequest) {
    this.logger.debug(
      'Processing initialize request',
      this.upstream.serverCapabilities
    );
    // Validate upstream capabilities - stale pooled connections may have undefined capabilities
    let capabilities = this.upstream.serverCapabilities;
    if (!capabilities) {
      this.logger.warn(
        'Upstream serverCapabilities is undefined - attempting to re-fetch'
      );

      // Try to re-fetch capabilities from the SDK client
      try {
        await this.upstream.fetchCapabilities();
        capabilities = this.upstream.serverCapabilities;
      } catch (error) {
        this.logger.error('Failed to re-fetch capabilities', error);
      }

      // If still undefined after re-fetch, mark unhealthy and fail
      if (!capabilities) {
        this.logger.error(
          'Upstream serverCapabilities still undefined after re-fetch - marking connection unhealthy'
        );
        this.markUpstreamUnhealthy();
        await this.downstream.sendError(
          (request as any).id,
          ErrorCode.InternalError,
          'Upstream connection is stale - please retry'
        );
        return;
      }
    }

    // Get upstream server info to pass through to client
    // This way clients see the actual server they're talking to
    const upstreamServerInfo = this.upstream.getServerVersion();

    const clientVersion = request.params.protocolVersion;

    // Negotiate protocol version per MCP spec:
    // If we support the client's version, use it; otherwise use our latest
    const negotiatedVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(
      clientVersion as any
    )
      ? clientVersion
      : LATEST_PROTOCOL_VERSION;

    this.logger.debug(
      `Version negotiation: client=${clientVersion}, negotiated=${negotiatedVersion}`
    );

    const result: InitializeResult = {
      protocolVersion: negotiatedVersion,
      capabilities,
      serverInfo: upstreamServerInfo
        ? {
            name: upstreamServerInfo.name,
            version: upstreamServerInfo.version,
          }
        : {
            // Fallback if upstream doesn't provide server info
            name: `${this.config.serverId}`,
            version: '1.0.0',
          },
    };

    this.logger.debug(
      `Sending initialize response with tools: ${!!result.capabilities?.tools}`
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
   * Check if a capability is disabled via access control
   */
  private async isCapabilityDisabledCheck(
    name: string,
    type: CapabilityType
  ): Promise<boolean> {
    return isCapabilityDisabled(
      this.config.serverId,
      this.config.workspaceId,
      name,
      type
    );
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
   * Sync server metadata to control plane in the background
   * Called after successful upstream connection to capture serverInfo and instructions
   * Non-blocking - errors are logged but don't affect the response
   */
  private syncServerMetadataToControlPlane(): void {
    const controlPlane = this.context?.get('controlPlane') as
      | ControlPlane
      | undefined;

    if (!controlPlane) return;

    const serverInfo = this.upstream.serverInfo;
    const instructions = this.upstream.instructions;
    const capabilities = this.upstream.serverCapabilities;

    // Only sync if we have some metadata to sync
    if (!serverInfo && !instructions) return;

    // Build metadata object with MCP 2025-11-25 spec fields
    const metadata: Parameters<typeof controlPlane.syncMCPServerMetadata>[2] = {
      // Server info (Implementation interface)
      server_name: serverInfo?.name,
      server_version: serverInfo?.version,
      title: serverInfo?.title,
      description: serverInfo?.description,
      website_url: serverInfo?.websiteUrl,
      icons: serverInfo?.icons,
      // Server capabilities flags
      capability_flags: capabilities,
      // LLM instructions from InitializeResult
      instructions: instructions,
    };

    // Fire and forget - don't await
    controlPlane
      .syncMCPServerMetadata(
        this.config.serverId,
        this.config.workspaceId,
        metadata
      )
      .then((success) => {
        if (success) {
          this.logger.debug(
            `Synced server metadata to control plane: ${serverInfo?.name}`
          );
        }
      })
      .catch((error) => {
        this.logger.debug(
          'Failed to sync server metadata to control plane',
          error
        );
      });
  }

  /**
   * Sync capabilities to control plane in the background
   * Non-blocking - errors are logged but don't affect the response
   *
   * Supports MCP 2025-11-25 spec fields
   */
  private syncCapabilitiesToControlPlane(
    capabilities: Array<{
      name: string;
      type: 'tool' | 'prompt' | 'resource';
      // Common fields
      title?: string;
      description?: string;
      icons?: Array<{
        src: string;
        mimeType?: string;
        sizes?: string[];
        theme?: 'light' | 'dark';
      }>;
      annotations?: object;
      meta?: object;
      // Tool-specific
      input_schema?: object;
      output_schema?: object;
      execution?: object;
      tool_annotations?: object;
      // Prompt-specific
      arguments?: object[];
      // Resource-specific
      uri?: string;
      mime_type?: string;
      size?: number;
    }>
  ): void {
    const controlPlane = this.context?.get('controlPlane') as
      | ControlPlane
      | undefined;

    if (!controlPlane || capabilities.length === 0) return;

    // Fire and forget - don't await
    controlPlane
      .syncMCPServerCapabilities(
        this.config.serverId,
        this.config.workspaceId,
        capabilities
      )
      .then((success) => {
        if (success) {
          this.logger.debug(
            `Synced ${capabilities.length} capabilities to control plane`
          );
        }
      })
      .catch((error) => {
        this.logger.debug(
          'Failed to sync capabilities to control plane',
          error
        );
      });
  }

  /**
   * Handle `tools/list` with filtering
   */
  private async handleToolsList(request: ListToolsRequest) {
    this.logger.debug('Fetching upstream tools');

    try {
      await this.ensureUpstreamConnection();

      const upstreamResult = await this.upstream.listTools();

      // Validate upstream response - stale pooled connections may return invalid data
      if (!upstreamResult || !upstreamResult.tools) {
        this.logger.error(
          'Invalid upstream response for tools/list - marking connection unhealthy',
          { upstreamResult }
        );
        this.markUpstreamUnhealthy();
        throw new Error(
          'Upstream returned invalid response for tools/list - connection may be stale'
        );
      }

      // Sync all discovered tools to control plane (background, non-blocking)
      // Maps MCP 2025-11-25 spec fields to Albus snake_case format
      this.syncCapabilitiesToControlPlane(
        upstreamResult.tools.map((tool: any) => ({
          name: tool.name,
          type: 'tool' as const,
          title: tool.title,
          description: tool.description,
          icons: tool.icons,
          input_schema: tool.inputSchema,
          output_schema: tool.outputSchema,
          execution: tool.execution,
          tool_annotations: tool.annotations,
          meta: tool._meta,
        }))
      );

      // First apply static config filtering
      let tools = this.filterTools(upstreamResult.tools);

      // Then filter out disabled capabilities via access control
      const controlPlane = this.context?.get('controlPlane') as
        | ControlPlane
        | undefined;
      if (controlPlane) {
        tools = await filterDisabledCapabilities(
          this.config.serverId,
          tools,
          'tool',
          this.config.workspaceId,
          controlPlane
        );
      }

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

    // Check static config-based access
    const validationError = this.validateToolAccess(toolName);

    if (validationError) {
      await this.downstream.sendError(
        (request as any).id,
        ErrorCode.InvalidParams,
        `Tool '${toolName}' is ${validationError}`
      );
      return;
    }

    // Check if tool is disabled via access control
    const isDisabled = await this.isCapabilityDisabledCheck(toolName, 'tool');
    if (isDisabled) {
      await this.downstream.sendError(
        (request as any).id,
        ErrorCode.InvalidParams,
        `Tool '${toolName}' is disabled`
      );
      return;
    }

    try {
      await this.ensureUpstreamConnection();

      const startTime = Date.now();
      const result = await this.upstream.callTool(request.params);
      const durationMs = Date.now() - startTime;

      this.logger.debug(`Tool ${toolName} executed successfully`);

      // This is where the guardrails would come in.
      await this.downstream.sendResult((request as any).id, result);
      this.logResult(request, result, { ok: true, durationMs });
    } catch (error) {
      // Handle upstream errors
      this.logger.error(`Tool call failed: ${toolName}`, error);

      // Mark pooled upstream as unhealthy if this looks like a connection error
      if (isConnectionError(error)) {
        this.markUpstreamUnhealthy();
      }

      await this.downstream.sendError(
        (request as any).id,
        ErrorCode.InternalError,
        `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
      );

      // Log the error
      this.logResult(request, null, { ok: false, error });
    }
  }

  private async handleKnownRequests(request: JSONRPCRequest) {
    try {
      await this.ensureUpstreamConnection();

      const controlPlane = this.context?.get('controlPlane') as
        | ControlPlane
        | undefined;

      // Check capability access for prompts/get
      if (request.method === 'prompts/get' && (request.params as any)?.name) {
        const promptName = (request.params as any).name;
        const isDisabled = await this.isCapabilityDisabledCheck(
          promptName,
          'prompt'
        );
        if (isDisabled) {
          await this.downstream.sendError(
            request.id!,
            ErrorCode.InvalidParams,
            `Prompt '${promptName}' is disabled`
          );
          return;
        }
      }

      // Check capability access for resources/read
      if (request.method === 'resources/read' && (request.params as any)?.uri) {
        const resourceUri = (request.params as any).uri;
        const isDisabled = await this.isCapabilityDisabledCheck(
          resourceUri,
          'resource'
        );
        if (isDisabled) {
          await this.downstream.sendError(
            request.id!,
            ErrorCode.InvalidParams,
            `Resource '${resourceUri}' is disabled`
          );
          return;
        }
      }

      const methodHandlers: Record<string, () => Promise<any>> = {
        ping: () => this.upstream.ping(),
        'completion/complete': () => this.upstream.complete(request.params),
        'logging/setLevel': () => this.upstream.setLoggingLevel(request.params),
        'prompts/get': () => this.upstream.getPrompt(request.params),
        'prompts/list': async () => {
          const result = await this.upstream.listPrompts(request.params);

          // Sync all discovered prompts to control plane (background)
          // Maps MCP 2025-11-25 spec fields to Albus snake_case format
          if (result.prompts) {
            this.syncCapabilitiesToControlPlane(
              result.prompts.map((prompt: any) => ({
                name: prompt.name,
                type: 'prompt' as const,
                title: prompt.title,
                description: prompt.description,
                icons: prompt.icons,
                arguments: prompt.arguments,
                meta: prompt._meta,
              }))
            );
          }

          // Filter disabled prompts from list
          if (controlPlane && result.prompts) {
            result.prompts = await filterDisabledCapabilities(
              this.config.serverId,
              result.prompts,
              'prompt',
              this.config.workspaceId,
              controlPlane
            );
          }
          return result;
        },
        'resources/list': async () => {
          const result = await this.upstream.listResources(request.params);

          // Sync all discovered resources to control plane (background)
          // Maps MCP 2025-11-25 spec fields to Albus snake_case format
          if (result.resources) {
            this.syncCapabilitiesToControlPlane(
              result.resources.map((resource: any) => ({
                name: resource.name || resource.uri,
                type: 'resource' as const,
                title: resource.title,
                description: resource.description,
                icons: resource.icons,
                uri: resource.uri,
                mime_type: resource.mimeType,
                size: resource.size,
                annotations: resource.annotations,
                meta: resource._meta,
              }))
            );
          }

          // Filter disabled resources from list
          if (controlPlane && result.resources) {
            // Resources use 'uri' as identifier, map to 'name' for filtering
            const resourcesWithName = result.resources.map((r: any) => ({
              ...r,
              name: r.uri,
            }));
            const filtered = await filterDisabledCapabilities(
              this.config.serverId,
              resourcesWithName,
              'resource',
              this.config.workspaceId,
              controlPlane
            );
            result.resources = filtered.map(({ name, ...rest }: any) => rest);
          }
          return result;
        },
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

      // Get organisation details (available in both API key and OAuth flows)
      const orgDetails = this.gatewayToken?._organisationDetails;
      const workspaceDetails = orgDetails?.workspaceDetails;

      // Merge custom metadata: incoming header + api key defaults + workspace defaults
      const portkeyMetadata = {
        ...(this.gatewayToken?._incomingMetadata || {}),
        ...(orgDetails?.apiKeyDetails?.defaults?.metadata || {}),
        ...(workspaceDetails?.defaults?.metadata || {}),
      };

      const attrs: Record<string, any> = {
        'mcp.server.id': this.config.serverId,
        'mcp.workspace.id': this.config.workspaceId,

        'mcp.transport.client': this.getClientTransportType() ?? '',
        'mcp.transport.upstream': this.getUpstreamTransportType() ?? '',

        'mcp.request.method': method,
        'mcp.request.id': reqId,

        // Core identifiers - available in both API key and OAuth flows
        organisation_id: this.gatewayToken?.organisation_id || '',
        workspace_slug:
          this.config.workspaceId ||
          this.gatewayToken?.workspace_slug ||
          workspaceDetails?.slug ||
          '',
        user_id:
          this.gatewayToken?.user_id || this.gatewayToken?.username || '',

        // Extended workspace metadata - available in both flows
        organisation_name: this.gatewayToken?.organisation_name || '',
        workspace_id: workspaceDetails?.id || '',
        workspace_name: this.gatewayToken?.workspace_name || '',
        // Only include api_key_id for API key auth (not external auth/OAuth)
        ...(this.gatewayToken?.token_type === 'api_key' && {
          api_key_id: this.gatewayToken?.sub || '',
        }),

        // Auth type for distinguishing flows in logs
        'mcp.auth.type': this.gatewayToken?.token_type || 'unknown',

        // Custom metadata from x-portkey-metadata header + workspace/org defaults
        ...portkeyMetadata,
      };

      if (toolName) {
        attrs['mcp.tool.name'] = toolName;
        attrs['mcp.tool.params'] =
          (request as CallToolRequest)?.params?.arguments ?? {};
        attrs['mcp.tool.result'] = result ?? {};
      } else {
        attrs['mcp.result'] = result ?? {};
      }

      if (outcome?.ok) {
        attrs['mcp.request.success'] = 'true';
        attrs['mcp.request.duration_ms'] = outcome?.durationMs || 0;
      } else {
        attrs['mcp.request.success'] = 'false';
        attrs['mcp.request.error'] = outcome?.error
          ? (outcome.error as Error)?.message ?? 'Unknown error'
          : 'Unknown error';
        attrs['mcp.request.duration_ms'] = outcome?.durationMs || 0;
      }

      emitLog({ type: 'mcp.request' }, attrs, env(this.context as Context));
    } catch (error) {
      this.logger.error('Failed to log result', error);
    }
  }

  /**
   * Clean up the session
   *
   * Note: If using a pooled upstream (poolKey is non-empty), we don't close it -
   * it stays in the pool for reuse. We only close the downstream transport.
   *
   * For non-pooled connections (anonymous users or disabled pooling),
   * poolKey is empty string and we must close the upstream.
   */
  async close() {
    this.status = SessionStatus.Closed;

    // Close upstream only for non-pooled connections (poolKey is empty string)
    // Pooled connections stay in the pool for reuse
    if (this.poolKey === '') {
      await this.upstream.close();
    }

    await this.downstream.close();
  }

  /**
   * Mark the pooled upstream as unhealthy (e.g., after connection errors)
   * This will cause the pool to create a new connection on next request.
   */
  markUpstreamUnhealthy(): void {
    // Only mark unhealthy if we have a pool key (pooled connection)
    if (this.poolKey && this.poolKey !== '') {
      getConnectionPool().markUnhealthy(this.poolKey);
      this.logger.debug(`Marked pooled upstream as unhealthy: ${this.poolKey}`);
    }
  }

  /**
   * Get the pool key for this session (if using pooled connection)
   */
  getPoolKey(): string | undefined {
    return this.poolKey;
  }
}
