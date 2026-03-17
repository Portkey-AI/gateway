/**
 * Presigned Token Auth Middleware for MCP Gateway
 * Validates presigned tokens in MCP requests (from ?token= query parameter)
 */

import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import { createLogger } from '../../shared/utils/logger.js';
import { MCPTokenVerifier, type MCPTokenPayload } from '../utils/tokenVerifier.js';

const logger = createLogger('mcp/presigned-auth');

type Env = {
  Variables: {
    tokenInfo?: {
      active: boolean;
      token?: string;
      username?: string;
      client_id?: string;
      session_id?: string;
      mcp_server_url?: string;
      mcp_server_name?: string;
      payload?: MCPTokenPayload;
    };
    userId?: string;
    presignedAuth?: boolean;
    serverUrl?: string;
  };
};

/**
 * Presigned token auth middleware
 * Validates ?token= query parameter for presigned MCP URLs
 * Falls back to header-based auth if no token present
 */
export function presignedAuthMiddleware() {
  const ADAPTER_TOKEN_SECRET = process.env.ADAPTER_TOKEN_SECRET;

  return createMiddleware<Env>(async (c, next) => {
    const token = c.req.query('token');

    // If no token in query param, skip and let other auth handle it
    if (!token) {
      return next();
    }

    // Validate that secret is configured
    if (!ADAPTER_TOKEN_SECRET) {
      logger.error('ADAPTER_TOKEN_SECRET not configured');
      throw new HTTPException(500, {
        message: 'Server configuration error',
      });
    }

    // Verify the token
    const verifier = new MCPTokenVerifier(ADAPTER_TOKEN_SECRET);
    const requestPath = '/mcp/*'; // MCP paths are covered by /mcp/* pattern

    const { isValid, payload, error } = verifier.verifyToken(token, requestPath);

    if (!isValid || !payload) {
      logger.warn('Invalid presigned token', { error });
      throw new HTTPException(401, {
        message: error || 'Invalid or expired presigned token',
      });
    }

    // Extract MCP-specific metadata from token payload
    const mcpServerUrl = payload.meta?.mcp_server_url as string | undefined;
    const mcpServerName = payload.meta?.mcp_server_name as string | undefined;

    // Set token info in context
    c.set('tokenInfo', {
      active: true,
      token: token,
      username: payload.uid,
      client_id: payload.cid,
      session_id: payload.sid,
      mcp_server_url: mcpServerUrl,
      mcp_server_name: mcpServerName,
      payload: payload,
    });

    c.set('userId', payload.uid);
    c.set('presignedAuth', true);

    // If the token includes a specific server URL, validate it matches the request
    if (mcpServerUrl) {
      const requestServerUrl = c.get('serverUrl');
      if (requestServerUrl && normalizeUrl(requestServerUrl) !== normalizeUrl(mcpServerUrl)) {
        logger.warn('Token server URL mismatch', {
          tokenUrl: mcpServerUrl,
          requestUrl: requestServerUrl,
        });
        throw new HTTPException(403, {
          message: 'Token is not valid for this MCP server',
        });
      }
    }

    logger.debug('Presigned auth successful', {
      userId: payload.uid,
      sessionId: payload.sid,
      mcpServer: mcpServerName,
    });

    return next();
  });
}

/**
 * Normalize URL for comparison (lowercase host, remove trailing slash)
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    return url.toLowerCase().replace(/\/+$/, '');
  }
}

/**
 * Combined auth middleware that checks presigned token first, then falls back to header auth
 */
export function combinedAuthMiddleware(
  headerAuthMiddleware: (c: any, next: () => Promise<void>) => Promise<any>
) {
  const presignedMiddleware = presignedAuthMiddleware();

  return createMiddleware<Env>(async (c, next) => {
    // Check for presigned token
    const token = c.req.query('token');

    if (token) {
      // Use presigned auth
      return presignedMiddleware(c, next);
    } else {
      // Fall back to header-based auth
      return headerAuthMiddleware(c, next);
    }
  });
}

export type { Env as PresignedAuthEnv };
