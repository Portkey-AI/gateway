/**
 * @file src/middlewares/oauth/index.ts
 * OAuth 2.1 validation middleware for MCP Gateway
 *
 * Implements RFC 9728 (Protected Resource Metadata) and RFC 8414 (Authorization Server Metadata)
 * for MCP server authentication per the Model Context Protocol specification.
 */

import { Context, Next } from 'hono';
import { createMiddleware } from 'hono/factory';
import { createLogger } from '../../utils/logger';
import {
  OAuthGateway,
  TokenIntrospectionResponse,
} from '../../services/oauthGateway';

type Env = {
  Variables: {
    serverConfig?: any;
    session?: any;
    tokenInfo?: any;
    isAuthenticated?: boolean;
  };
  Bindings: {
    ALBUS_BASEPATH?: string;
  };
};

const logger = createLogger('OAuth-Middleware');

// Using TokenIntrospectionResponse from OAuthGateway service

// Simple in-memory cache for token introspection results
// In production, use Redis or similar
const tokenCache = new Map<
  string,
  {
    response: TokenIntrospectionResponse;
    expires: number;
  }
>();

interface OAuthConfig {
  required?: boolean; // Whether OAuth is required for this route
  scopes?: string[]; // Required scopes for this route
  skipPaths?: string[]; // Paths to skip OAuth validation
}

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/**
 * Create WWW-Authenticate header value per RFC 9728
 */
function createWWWAuthenticateHeader(
  baseUrl: string,
  error?: string,
  errorDescription?: string
): string {
  let header = `Bearer realm="${baseUrl}"`;
  header += `, as_uri="${baseUrl}/.well-known/oauth-protected-resource"`;

  if (error) {
    header += `, error="${error}"`;
    if (errorDescription) {
      header += `, error_description="${errorDescription}"`;
    }
  }

  return header;
}

/**
 * Introspect token with the control plane or local service
 */
async function introspectToken(
  token: string,
  controlPlaneUrl: string | null
): Promise<TokenIntrospectionResponse> {
  // Check cache first
  const cached = tokenCache.get(token);
  if (cached && cached.expires > Date.now()) {
    logger.debug('Token found in cache');
    return cached.response;
  }

  try {
    const gateway = new OAuthGateway(controlPlaneUrl);
    const result = await gateway.introspectToken(token);

    // Cache the result for 5 minutes or until token expiry
    if (result.active) {
      const expiresIn = result.exp
        ? Math.min(result.exp * 1000 - Date.now(), 5 * 60 * 1000)
        : 5 * 60 * 1000;

      tokenCache.set(token, {
        response: result,
        expires: Date.now() + expiresIn,
      });
    }

    return result;
  } catch (error) {
    logger.error('Failed to introspect token', error);
    return { active: false };
  }
}

/**
 * OAuth validation middleware factory
 */
export function oauthMiddleware(config: OAuthConfig = {}) {
  return createMiddleware<Env>(async (c, next) => {
    const path = c.req.path;

    // Skip OAuth for certain paths
    if (config.skipPaths?.some((skip) => path.startsWith(skip))) {
      return next();
    }

    const baseUrl = new URL(c.req.url).origin;
    const authorization = c.req.header('Authorization');
    const token = extractBearerToken(authorization);

    // If no token and OAuth is not required, continue
    if (!token && !config.required) {
      logger.debug(`No token provided for ${path}, continuing without auth`);
      return next();
    }

    // If no token and OAuth is required, return 401
    if (!token && config.required) {
      logger.warn(`No token provided for protected resource ${path}`);
      return c.json(
        {
          error: 'unauthorized',
          error_description: 'Authentication required to access this resource',
        },
        401,
        {
          'WWW-Authenticate': createWWWAuthenticateHeader(
            baseUrl,
            'invalid_request',
            'Bearer token required'
          ),
        }
      );
    }

    // Validate token with control plane or local service
    const controlPlaneUrl = c.env?.ALBUS_BASEPATH || process.env.ALBUS_BASEPATH;

    // Introspect the token (works with both control plane and local service)
    const introspection = await introspectToken(token!, controlPlaneUrl!);

    if (!introspection.active) {
      logger.warn(`Invalid or expired token for ${path}`);
      return c.json(
        {
          error: 'invalid_token',
          error_description: 'The access token is invalid or has expired',
        },
        401,
        {
          'WWW-Authenticate': createWWWAuthenticateHeader(
            baseUrl,
            'invalid_token',
            'Token validation failed'
          ),
        }
      );
    }

    // Check required scopes if configured
    if (config.scopes && config.scopes.length > 0) {
      const tokenScopes = introspection.scope?.split(' ') || [];

      // Extract server ID from path if it's a server-specific endpoint
      const serverMatch = path.match(/^\/([^\/]+)\/(mcp|messages)/);
      const serverId = serverMatch?.[1];

      logger.info('Scope validation:', {
        path,
        serverId,
        required_scopes: config.scopes,
        token_scopes: tokenScopes,
        introspection_scope: introspection.scope,
        client_id: introspection.client_id,
      });

      const hasRequiredScope = config.scopes.some((required) => {
        // Check for exact match
        if (tokenScopes.includes(required)) return true;

        // Check for wildcard match
        if (tokenScopes.includes('mcp:*')) return true;

        // Check for server-specific wildcard (e.g., mcp:servers:*)
        if (required === 'mcp:servers:*' && serverId) {
          return tokenScopes.some(
            (scope) =>
              scope === 'mcp:servers:*' ||
              scope === `mcp:servers:${serverId}` ||
              scope === 'mcp:*'
          );
        }

        return false;
      });

      if (!hasRequiredScope) {
        logger.warn(
          `Token missing required scopes for ${path}. Token scopes: ${tokenScopes.join(', ')}`
        );
        return c.json(
          {
            error: 'insufficient_scope',
            error_description: `Required scope: ${config.scopes.join(' or ')}. Token has: ${tokenScopes.join(', ')}`,
          },
          403,
          {
            'WWW-Authenticate': createWWWAuthenticateHeader(
              baseUrl,
              'insufficient_scope',
              `Required scope: ${config.scopes.join(' or ')}`
            ),
          }
        );
      }
    }

    // Store token info in context for downstream use
    c.set('tokenInfo', introspection);
    c.set('isAuthenticated', true);

    logger.debug(
      `Token validated for ${path}, client: ${introspection.client_id}`
    );
    return next();
  });
}

/**
 * Clean up expired tokens from cache periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of tokenCache.entries()) {
    if (data.expires <= now) {
      tokenCache.delete(token);
    }
  }
}, 60 * 1000); // Run every minute
