/**
 * MCP Gateway Constants
 * Self-contained constants for the MCP Gateway module
 */

// =============================================================================
// HTTP Headers
// =============================================================================

export const MCP_HEADERS = {
  // Session management
  SESSION_ID: 'mcp-session-id',
  LAST_EVENT_ID: 'last-event-id',

  // Client identification
  WORKSPACE_ID: 'x-workspace-id',
  SERVER_ID: 'x-server-id',
  TOOLKIT_ID: 'x-toolkit-id',

  // Authentication
  AUTHORIZATION: 'authorization',
  API_KEY: 'x-api-key',
  STRINGCOST_API_KEY: 'x-stringcost-api-key',

  // Transport hints
  ACCEPT: 'accept',
  CONTENT_TYPE: 'content-type',

  // Portkey compatibility
  PORTKEY_API_KEY: 'x-portkey-api-key',
  PORTKEY_VIRTUAL_KEY: 'x-portkey-virtual-key',
} as const;

// =============================================================================
// Content Types
// =============================================================================

export const CONTENT_TYPES = {
  JSON: 'application/json',
  SSE: 'text/event-stream',
  JSONRPC: 'application/json-rpc',
} as const;

// =============================================================================
// Cache Namespaces
// =============================================================================

export const CACHE_NAMESPACES = {
  SESSIONS: 'mcp:sessions',
  SERVERS: 'mcp:servers',
  TOKENS: 'mcp:tokens',
  TOOLKITS: 'mcp:toolkits',
  OAUTH_STATE: 'mcp:oauth:state',
} as const;

// =============================================================================
// Timeouts (in milliseconds)
// =============================================================================

export const TIMEOUTS = {
  // Session TTL - 30 minutes of inactivity
  SESSION_TTL: 30 * 60 * 1000,

  // Request timeout for upstream MCP calls
  REQUEST_TIMEOUT: 30 * 1000,

  // SSE keepalive interval
  SSE_KEEPALIVE: 15 * 1000,

  // Connection timeout for establishing upstream connection
  CONNECTION_TIMEOUT: 10 * 1000,

  // Tool call timeout (individual tool execution)
  TOOL_CALL_TIMEOUT: 60 * 1000,

  // OAuth state expiry
  OAUTH_STATE_TTL: 10 * 60 * 1000,

  // Cache TTL for server configs
  SERVER_CONFIG_TTL: 5 * 60 * 1000,

  // Cache TTL for toolkit configs
  TOOLKIT_CONFIG_TTL: 5 * 60 * 1000,
} as const;

// =============================================================================
// MCP Protocol Constants
// =============================================================================

export const MCP_PROTOCOL = {
  // Protocol version
  VERSION: '2024-11-05',

  // JSON-RPC version
  JSONRPC_VERSION: '2.0',

  // Standard MCP methods
  METHODS: {
    INITIALIZE: 'initialize',
    INITIALIZED: 'notifications/initialized',
    PING: 'ping',
    TOOLS_LIST: 'tools/list',
    TOOLS_CALL: 'tools/call',
    RESOURCES_LIST: 'resources/list',
    RESOURCES_READ: 'resources/read',
    RESOURCES_SUBSCRIBE: 'resources/subscribe',
    RESOURCES_UNSUBSCRIBE: 'resources/unsubscribe',
    PROMPTS_LIST: 'prompts/list',
    PROMPTS_GET: 'prompts/get',
    LOGGING_SET_LEVEL: 'logging/setLevel',
    COMPLETION_COMPLETE: 'completion/complete',
  },

  // Notifications
  NOTIFICATIONS: {
    CANCELLED: 'notifications/cancelled',
    PROGRESS: 'notifications/progress',
    MESSAGE: 'notifications/message',
    RESOURCES_UPDATED: 'notifications/resources/updated',
    RESOURCES_LIST_CHANGED: 'notifications/resources/list_changed',
    TOOLS_LIST_CHANGED: 'notifications/tools/list_changed',
    PROMPTS_LIST_CHANGED: 'notifications/prompts/list_changed',
  },
} as const;

// =============================================================================
// SSE Event Types
// =============================================================================

export const SSE_EVENTS = {
  MESSAGE: 'message',
  ENDPOINT: 'endpoint',
  ERROR: 'error',
  PING: 'ping',
} as const;

// =============================================================================
// Error Messages
// =============================================================================

export const ERROR_MESSAGES = {
  // Authentication errors
  MISSING_API_KEY: 'Missing API key',
  INVALID_API_KEY: 'Invalid API key',
  MISSING_WORKSPACE_ID: 'Missing workspace ID',
  MISSING_SERVER_ID: 'Missing server ID',

  // Server errors
  SERVER_NOT_FOUND: 'MCP server not found',
  SERVER_NOT_ACTIVE: 'MCP server is not active',
  SERVER_CONNECTION_FAILED: 'Failed to connect to MCP server',

  // Toolkit errors
  TOOLKIT_NOT_FOUND: 'Toolkit not found',
  TOOLKIT_NOT_ACTIVE: 'Toolkit is not active',

  // Session errors
  SESSION_NOT_FOUND: 'Session not found',
  SESSION_EXPIRED: 'Session has expired',
  SESSION_CLOSED: 'Session has been closed',

  // Tool errors
  TOOL_NOT_ALLOWED: 'Tool is not allowed by toolkit configuration',
  TOOL_NOT_FOUND: 'Tool not found',
  TOOL_CALL_FAILED: 'Tool call failed',
  TOOL_CALL_TIMEOUT: 'Tool call timed out',

  // Transport errors
  UNSUPPORTED_TRANSPORT: 'Unsupported transport type',
  SSE_CONNECTION_FAILED: 'SSE connection failed',

  // Protocol errors
  INVALID_JSONRPC: 'Invalid JSON-RPC request',
  METHOD_NOT_FOUND: 'Method not found',
  INVALID_PARAMS: 'Invalid parameters',

  // OAuth errors
  OAUTH_REQUIRED: 'OAuth authentication required',
  OAUTH_STATE_INVALID: 'Invalid OAuth state',
  OAUTH_TOKEN_EXPIRED: 'OAuth token has expired',
  OAUTH_REFRESH_FAILED: 'Failed to refresh OAuth token',
} as const;

// =============================================================================
// Default Values
// =============================================================================

export const DEFAULTS = {
  // Default transport type
  TRANSPORT: 'sse' as const,

  // Default auth type
  AUTH_TYPE: 'none' as const,

  // Gateway info for MCP initialize
  GATEWAY_NAME: 'StringCost MCP Gateway',
  GATEWAY_VERSION: '1.0.0',

  // Maximum tools per page for list responses
  MAX_TOOLS_PER_PAGE: 100,

  // Maximum concurrent connections per session
  MAX_CONCURRENT_CONNECTIONS: 5,

  // Session cleanup interval
  SESSION_CLEANUP_INTERVAL: 5 * 60 * 1000,
} as const;

// =============================================================================
// JSON-RPC Error Codes
// =============================================================================

export const JSONRPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Custom error codes (implementation-specific)
  SERVER_ERROR: -32000,
  TOOL_NOT_ALLOWED: -32001,
  SESSION_NOT_FOUND: -32002,
  UPSTREAM_ERROR: -32003,
} as const;

// =============================================================================
// Environment Variable Names
// =============================================================================

export const ENV_VARS = {
  CONTROL_PLANE_URL: 'CONTROL_PLANE_URL',
  CONTROL_PLANE_API_KEY: 'CONTROL_PLANE_API_KEY',
  REDIS_URL: 'REDIS_CONNECTION_STRING',
  MCP_SESSION_SECRET: 'MCP_SESSION_SECRET',
  MCP_OAUTH_ENABLED: 'MCP_OAUTH_ENABLED',
  LOG_LEVEL: 'LOG_LEVEL',
} as const;
