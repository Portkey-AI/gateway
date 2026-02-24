import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  OAuthClientMetadata,
  OAuthMetadata,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { JwtValidationConfig } from '../../shared/services/jwt/types';

// Upstream connection types (to MCP servers) - SSE is still supported
export type ConnectionTypes = 'http-sse' | 'sse-http' | 'http' | 'sse';

// Client transport for upstream connections (SSE still supported for upstream)
export type ClientTransport =
  | StreamableHTTPClientTransport
  | SSEClientTransport;

// Server transport for downstream connections (SSE removed - HTTP Streamable only)
export type ServerTransport = StreamableHTTPServerTransport;

// Transport types for upstream connections (SSE still supported)
export type TransportTypes = 'http' | 'sse';

/**
 * User identity forwarding configuration
 * Determines how authenticated user claims are forwarded to upstream MCP servers
 */
export interface UserIdentityForwardingConfig {
  /**
   * Method for forwarding user identity:
   * - 'claims_header': Send claims as JSON in X-User-Claims header (default)
   * - 'bearer': Forward the original OAuth token in Authorization header
   * - 'jwt_header': Send Portkey-signed JWT containing claims in X-User-JWT header
   */
  method: 'claims_header' | 'bearer' | 'jwt_header';

  /**
   * Claims to include when forwarding user identity
   * If not specified, defaults to: ['sub', 'email', 'workspace_id', 'organisation_id', 'user_id']
   */
  include_claims?: string[];

  /**
   * Custom header name (optional)
   * Defaults:
   * - claims_header: 'X-User-Claims'
   * - bearer: 'Authorization'
   * - jwt_header: 'X-User-JWT'
   */
  header_name?: string;

  /**
   * JWT expiry time in seconds (only for jwt_header method)
   * Default: 300 (5 minutes)
   */
  jwt_expiry_seconds?: number;
}

/**
 * Server configuration for gateway
 */
export interface ServerConfig {
  serverId: string;
  workspaceId: string;
  organisationId?: string;
  url: string;
  headers: Record<string, string>;
  passthroughHeaders?: Record<string, string>; // Static headers to add to all upstream requests
  type?: ConnectionTypes;

  // Authentication configuration
  auth_type?: 'oauth_auto' | 'oauth_client_credentials' | 'headers';

  // Forward headers configuration - headers to forward from client requests to upstream
  // Can be:
  //   - string[]: Allowlist of specific headers to forward
  //   - { mode: 'allowlist', headers: string[] }: Explicit allowlist mode (same as array form)
  //   - { mode: 'all-except', headers: string[] }: Forward all headers except those listed (plus default security blocklist)
  forwardHeaders?:
    | string[]
    | {
        mode: 'allowlist' | 'all-except';
        headers: string[];
      };
  // OAuth client metadata (RFC 7591) for OAuth-protected upstream MCP servers
  // Customizes client information (name, logo, URIs, scopes, etc.) sent during
  // OAuth dynamic client registration or used as static client metadata
  oauth_client_metadata?: Partial<OAuthClientMetadata>;
  oauth_server_metadata?: Partial<OAuthMetadata>;

  // External auth configuration for servers that handle auth externally
  // When set, gateway will use this config instead of control plane for OAuth
  external_auth_config?: {
    // OAuth server metadata for the external auth provider
    issuer?: string;
    authorization_endpoint: string;
    token_endpoint: string;
    registration_endpoint?: string;
    revocation_endpoint?: string;
    code_challenge_methods_supported?: string[];
    token_endpoint_auth_methods_supported?: string[];
    grant_types_supported?: string[];
    scopes_supported?: string[];
    response_types_supported?: string[];
    // Pre-registered client credentials (optional - if not provided, dynamic registration will be attempted)
    client_id?: string;
    client_secret?: string;
    // Additional OAuth metadata
    scope?: string;
  };
  // Tool-specific policies
  tools?: {
    allowed?: string[]; // If specified, only these tools are allowed
    blocked?: string[]; // These tools are always blocked
    rateLimit?: {
      requests: number; // Max requests per window
      window: number; // Window in seconds
    };
    logCalls?: boolean; // Log all tool calls for monitoring
  };

  // Transport configuration
  transport?: {
    // Preferred transport type for upstream connection
    preferred?: 'http' | 'sse';
    // Whether to allow fallback to other transports
    allowFallback?: boolean;
  };

  // Connection pooling configuration
  // Set to true to disable connection pooling for this server (security)
  // Useful for servers that maintain per-request state
  disablePooling?: boolean;
  // User identity forwarding configuration
  // When configured, forwards authenticated user claims to upstream MCP servers
  user_identity_forwarding?: UserIdentityForwardingConfig;

  // JWT validation configuration
  // When configured, validates incoming JWTs before proxying to upstream MCP servers
  jwt_validation?: JwtValidationConfig;
}
