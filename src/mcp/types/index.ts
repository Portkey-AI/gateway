/**
 * MCP Gateway Types
 * Self-contained type definitions for the MCP Gateway module
 */

// =============================================================================
// Transport Types
// =============================================================================

export type TransportType = 'sse' | 'http';
export type TransportTypes = TransportType; // Alias for compatibility

// Generic transport interface - we proxy to upstream servers, not run our own MCP server
export interface ServerTransport {
  close(): Promise<void>;
}

export type ConnectionTypes = 'new' | 'existing';

export interface TransportConfig {
  type: TransportType;
  endpoint?: string;
}

// =============================================================================
// Server Configuration
// =============================================================================

export type AuthType = 'none' | 'bearer' | 'api_key' | 'oauth' | 'oauth_auto';

export interface OAuthConfig {
  client_id: string;
  client_secret?: string;
  authorization_url: string;
  token_url: string;
  scopes?: string[];
  redirect_uri?: string;
}

export interface ServerConfig {
  id?: string;
  serverId: string;
  workspaceId?: string;
  serverLabel?: string;
  url: string;
  transport?: {
    preferred?: TransportType;
    allowFallback?: boolean;
  };
  authType?: AuthType;
  authConfig?: Record<string, unknown>;
  headers?: Record<string, string>;
  oauthConfig?: OAuthConfig;
  isActive?: boolean;
  toolSchema?: ToolListResponse;
  toolSchemaUpdatedAt?: Date;
  // Tool filtering configuration
  tools?: {
    allowed?: string[];
    blocked?: string[];
    rateLimit?: {
      requests: number;
      window: number;
    };
    logCalls?: boolean;
  };
}

export interface ServerTokens {
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  token_type: string;
  scopes?: string[];
  /** RFC 8707: Resource the token is bound to (prevents cross-resource replay) */
  resource?: string;
}

// =============================================================================
// Toolkit Configuration
// =============================================================================

/**
 * Parameter validation rules for fine-grained tool permissions
 */
export interface ParameterRule {
  /** Regex pattern the value must match */
  pattern?: string;
  /** Maximum length for string values */
  maxLength?: number;
  /** Minimum length for string values */
  minLength?: number;
  /** Allowed values (whitelist) */
  allowedValues?: string[];
  /** Blocked values (blacklist) */
  blockedValues?: string[];
  /** Maximum value for numbers */
  maximum?: number;
  /** Minimum value for numbers */
  minimum?: number;
}

/**
 * Fine-grained permission for a specific tool
 */
export interface ToolPermission {
  /** Whether the tool is allowed */
  allowed: boolean;
  /** Parameter-level validation rules */
  parameters?: Record<string, ParameterRule>;
}

export interface ToolkitConfig {
  id: string;
  name: string;
  description?: string;
  allowedTools: string[];
  blockedTools: string[];
  /** Fine-grained per-tool permissions with parameter validation */
  toolPermissions?: Record<string, ToolPermission>;
  mcpServerIds: string[];
  metadata?: Record<string, unknown>;
  isActive: boolean;
}

// =============================================================================
// Session Management
// =============================================================================

export enum SessionState {
  NEW = 'new',
  INITIALIZING = 'initializing',
  ACTIVE = 'active',
  DORMANT = 'dormant',
  CLOSED = 'closed',
}

export interface TransportCapabilities {
  clientTransport: TransportType;
  upstreamTransport: TransportType;
}

export interface SessionInfo {
  sessionId: string;
  serverUrl: string;
  apiKeyHash: string; // Hash of API key for identification without exposing the key
  state: SessionState;
  clientTransportType: TransportType;
  upstreamTransportType: TransportType;
  createdAt: Date;
  lastActivityAt: Date;
  toolkitConfig?: ToolkitConfig;
}

export interface SessionData {
  session: SessionInfo;
  serverConfig: ServerConfig;
  tokens?: ServerTokens;
}

// =============================================================================
// MCP Protocol Types
// =============================================================================

export interface JSONRPCRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: unknown;
  error?: JSONRPCError;
}

export interface JSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JSONRPCNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

// Standard JSON-RPC error codes
export const JSONRPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

// =============================================================================
// MCP Tool Types
// =============================================================================

export interface Tool {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolListResponse {
  tools: Tool[];
}

export interface ToolCallRequest {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface ToolCallResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

// =============================================================================
// MCP Resource Types
// =============================================================================

export interface Resource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface ResourceListResponse {
  resources: Resource[];
}

// =============================================================================
// MCP Prompt Types
// =============================================================================

export interface Prompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface PromptListResponse {
  prompts: Prompt[];
}

// =============================================================================
// MCP Initialize Types
// =============================================================================

export interface ClientCapabilities {
  experimental?: Record<string, unknown>;
  sampling?: Record<string, unknown>;
  roots?: {
    listChanged?: boolean;
  };
}

export interface ServerCapabilities {
  experimental?: Record<string, unknown>;
  logging?: Record<string, unknown>;
  prompts?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  tools?: {
    listChanged?: boolean;
  };
}

export interface InitializeRequest {
  protocolVersion: string;
  capabilities: ClientCapabilities;
  clientInfo: {
    name: string;
    version: string;
  };
}

export interface InitializeResult {
  protocolVersion: string;
  capabilities: ServerCapabilities;
  serverInfo: {
    name: string;
    version: string;
  };
  instructions?: string;
}

// =============================================================================
// Context Types (for Hono middleware)
// =============================================================================

export interface MCPContext {
  sessionId?: string;
  serverUrl: string;
  apiKey: string;
  serverConfig: ServerConfig;
  toolkitConfig?: ToolkitConfig;
  tokens?: ServerTokens;
  clientTransportType: TransportType;
}

// =============================================================================
// Tool Invocation Logging
// =============================================================================

export interface ToolInvocationLog {
  requestId?: string;
  mcpServerId?: string;
  toolName: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  status?: 'success' | 'error' | 'timeout';
  errorMessage?: string;
}

// =============================================================================
// Event Types
// =============================================================================

export type MCPEvent =
  | { type: 'message'; data: JSONRPCResponse | JSONRPCNotification }
  | { type: 'error'; error: Error }
  | { type: 'close' }
  | { type: 'open' };

export interface EventHandler {
  onMessage?: (message: JSONRPCResponse | JSONRPCNotification) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
  onOpen?: () => void;
}
