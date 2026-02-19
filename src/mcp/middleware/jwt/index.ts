/**
 * @file src/mcp/middleware/jwt/index.ts
 * MCP JWT validation middleware
 *
 * Validates incoming JWTs before proxying to upstream MCP servers.
 * Works with the existing user_identity_forwarding configuration.
 */

import { createMiddleware } from 'hono/factory';
import { ServerConfig } from '../../types/mcp';
import {
  validateJwt,
  JwtValidationConfig,
  TokenInfo,
} from '../../../shared/services/jwt';
import { createLogger } from '../../../shared/utils/logger';

const logger = createLogger('mcp/jwt-middleware');

type Env = {
  Variables: {
    serverConfig?: ServerConfig;
    tokenInfo?: TokenInfo;
    isAuthenticated?: boolean;
  };
};

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^(?:Bearer\s+)?(.+)$/i);
  return match ? match[1] : null;
}

/**
 * MCP JWT validation middleware
 *
 * This middleware:
 * 1. Checks if jwt_validation is configured for the server
 * 2. Validates the incoming JWT using the shared JWT service
 * 3. Sets tokenInfo in context for downstream use (user_identity_forwarding)
 * 4. Returns 401 if validation fails
 *
 * @param getConfig - Function to get JWT config from context (typically from serverConfig)
 */
export function mcpJwtMiddleware(
  getConfig: (c: any) => JwtValidationConfig | undefined = (c) => {
    const serverConfig = c.get('serverConfig') as ServerConfig | undefined;
    if (!serverConfig?.jwt_validation) return undefined;

    // Merge external_auth_config credentials if not explicitly set in jwt_validation
    const jwtConfig = { ...serverConfig.jwt_validation };
    const extAuth = serverConfig.external_auth_config;

    if (extAuth) {
      // Use external_auth_config client credentials as fallback for introspection
      if (!jwtConfig.introspectClientId && extAuth.client_id) {
        jwtConfig.introspectClientId = extAuth.client_id;
      }
      if (!jwtConfig.introspectClientSecret && extAuth.client_secret) {
        jwtConfig.introspectClientSecret = extAuth.client_secret;
      }
    }

    return jwtConfig;
  }
) {
  return createMiddleware<Env>(async (c, next) => {
    const config = getConfig(c);

    if (!config) {
      // No JWT validation configured - skip (allow other auth methods)
      return next();
    }

    const headerKey = config.headerKey || 'Authorization';
    const authHeader = c.req.header(headerKey);

    if (!authHeader) {
      logger.warn(`JWT validation: Missing ${headerKey} header`);
      return c.json(
        {
          error: 'unauthorized',
          error_description: `Missing ${headerKey} header`,
        },
        401
      );
    }

    const token = extractBearerToken(authHeader);

    if (!token) {
      logger.warn('JWT validation: Invalid authorization header format');
      return c.json(
        {
          error: 'unauthorized',
          error_description: 'Invalid authorization header format',
        },
        401
      );
    }

    // Validate using shared JWT service
    const result = await validateJwt(token, config);

    if (!result.valid) {
      logger.warn(`JWT validation failed: ${result.error}`);
      return c.json(
        {
          error: 'unauthorized',
          error_description: result.error || 'JWT validation failed',
        },
        401
      );
    }

    // Set tokenInfo in context for downstream use (user_identity_forwarding)
    // Merge with any existing tokenInfo to preserve other auth data
    const existingTokenInfo = c.get('tokenInfo') || {};
    c.set('tokenInfo', {
      ...existingTokenInfo,
      ...result.payload,
      token,
      active: true,
      token_type: 'jwt',
    });
    c.set('isAuthenticated', true);

    logger.debug('JWT validation successful');
    return next();
  });
}

/**
 * Export the middleware factory for use in mcp-index.ts
 */
export default mcpJwtMiddleware;
