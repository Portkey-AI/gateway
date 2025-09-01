/**
 * Server configuration for gateway
 */
export interface ServerConfig {
  serverId: string;
  url: string;
  headers: Record<string, string>;

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
    preferred?: 'streamable-http' | 'sse';
    // Whether to allow fallback to other transports
    allowFallback?: boolean;
  };
}
