/**
 * @file src/middlewares/oauth/index.ts
 * OAuth 2.1 validation middleware for MCP Gateway
 *
 * Implements RFC 9728 (Protected Resource Metadata) and RFC 8414 (Authorization Server Metadata)
 * for MCP server authentication per the Model Context Protocol specification.
 */

import { createMiddleware } from 'hono/factory';
import { createLogger } from '../../utils/logger';
import {
  OAuthGateway,
  TokenIntrospectionResponse,
} from '../../services/oauthGateway';
import { getTokenCache } from '../../services/cache/index';
import { env } from 'hono/adapter';
import { Context } from 'hono';

type Env = {
  Variables: {
    serverConfig?: any;
    session?: any;
    tokenInfo?: any;
    isAuthenticated?: boolean;
  };
  Bindings: {
    ALBUS_BASEPATH?: string;
    CLIENT_ID?: string;
  };
};

const logger = createLogger('OAuth-Middleware');

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

  const match = authorization.match(/^(?:Bearer\s+)?(.+)$/i);
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
  c: Context
): Promise<TokenIntrospectionResponse> {
  // Check persistent cache first
  const cache = getTokenCache();
  const cached = await cache.get(token, 'introspection');
  if (cached) {
    logger.debug('Token found in persistent cache');
    return cached;
  }

  try {
    const gateway = new OAuthGateway(c);
    const result = await gateway.introspectToken(token, 'access_token');

    // Cache the result for 5 minutes or until token expiry
    if (result.active) {
      const expiresIn = result.exp
        ? Math.min(result.exp * 1000 - Date.now(), 5 * 60 * 1000)
        : 5 * 60 * 1000;

      await cache.set(token, result, {
        ttl: expiresIn,
        namespace: 'introspection',
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
    const authorization =
      c.req.header('Authorization') || c.req.header('x-portkey-api-key');
    const token = extractBearerToken(authorization);

    // If no token and OAuth is not required, continue
    // NOTE: For production security, OAuth should always be required
    if (!token && !config.required) {
      logger.warn(
        `No token provided for ${path}, continuing without auth - SECURITY RISK`
      );
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

    // Introspect the token (works with both control plane and local service)
    const controlPlaneUrl = env(c).ALBUS_BASEPATH;
    const introspection: any = await introspectToken(token!, c);

    introspection.token = token;

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

    // Store token info in context for downstream use
    c.set('tokenInfo', introspection);
    c.set('isAuthenticated', true);

    return next();
  });
}
