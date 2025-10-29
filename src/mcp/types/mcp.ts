import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp';

export type ConnectionTypes = 'http-sse' | 'sse-http' | 'http' | 'sse';

export type ClientTransport =
  | StreamableHTTPClientTransport
  | SSEClientTransport;
export type ServerTransport =
  | StreamableHTTPServerTransport
  | SSEServerTransport;

export type TransportTypes = 'http' | 'sse';

/**
 * Server configuration for gateway
 */
export interface ServerConfig {
  serverId: string;
  workspaceId: string;
  url: string;
  headers: Record<string, string>;
  passthroughHeaders?: Record<string, string>;
  type?: ConnectionTypes;

  // Authentication configuration
  auth_type?: 'oauth_auto' | 'oauth_client_credentials' | 'headers';

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
}
