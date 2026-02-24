/**
 * @file src/mcp/middleware/userAccess/index.ts
 * MCP User Access Check Middleware
 *
 * This middleware validates that the authenticated user has access to the
 * requested MCP server. It calls the control plane's user access check endpoint.
 *
 * The check is performed after authentication (OAuth or API key) and server
 * hydration, ensuring we have both user context and server configuration.
 */

import { createMiddleware } from 'hono/factory';
import { createLogger } from '../../../shared/utils/logger';
import { ControlPlane } from '../controlPlane';
import { requestCache } from '../../../services/cache/cacheService';
import { trackMcpServerUserAccessKey } from '../../utils/mcpCacheKeyTracker';

const logger = createLogger('mcp/userAccessMiddleware');

// Cache TTL for user access checks (5 minutes)
const USER_ACCESS_CACHE_TTL = 300;

type Env = {
  Variables: {
    serverConfig?: any;
    tokenInfo?: any;
    isAuthenticated?: boolean;
    controlPlane?: ControlPlane;
  };
};

interface UserAccessConfig {
  /**
   * Whether to skip the check for certain authentication types
   * Default: false (check all authenticated users)
   */
  skipForServiceAuth?: boolean;

  /**
   * Whether to fail open (allow access) when the control plane is unavailable
   * Default: false (deny access on errors)
   */
  failOpen?: boolean;

  /**
   * Whether to cache the user access check results
   * Default: true
   */
  enableCache?: boolean;
}

/**
 * Generate cache key for user access check
 */
function getUserAccessCacheKey(
  workspaceId: string,
  serverId: string,
  userId: string
): string {
  return `mcp:user-access:${workspaceId}:${serverId}:${userId}`;
}

/**
 * MCP User Access Check Middleware Factory
 *
 * Validates that the authenticated user has access to the requested MCP server
 * by calling the control plane's user access check endpoint.
 *
 * @param config - Configuration options for the middleware
 * @returns Hono middleware function
 */
export function mcpUserAccessMiddleware(config: UserAccessConfig = {}) {
  const {
    skipForServiceAuth = false,
    failOpen = false,
    enableCache = true,
  } = config;

  return createMiddleware<Env>(async (c, next) => {
    const controlPlane = c.get('controlPlane');
    const tokenInfo = c.get('tokenInfo');
    const serverConfig = c.get('serverConfig');

    // Skip if no control plane is available (local/self-hosted mode)
    if (!controlPlane) {
      logger.debug('No control plane available, skipping user access check');
      return next();
    }

    // Skip if user is not authenticated
    if (!tokenInfo || !c.get('isAuthenticated')) {
      logger.debug('User not authenticated, skipping user access check');
      return next();
    }

    // Skip for service auth if configured
    if (skipForServiceAuth && tokenInfo.token_type === 'service') {
      logger.debug('Service auth detected, skipping user access check');
      return next();
    }

    // Get workspace and server IDs
    const workspaceId =
      c.req.param('workspaceId') ||
      tokenInfo.workspace_id ||
      serverConfig?.workspaceId;
    const serverId = c.req.param('serverId') || serverConfig?.serverId;

    if (!workspaceId || !serverId) {
      logger.warn('Missing workspaceId or serverId for user access check');
      return next();
    }

    // Get user identifier from token info
    // For OAuth: username or sub claim
    // For API key: the API key's associated user_id from organisation details
    const userId =
      tokenInfo.username ||
      tokenInfo.sub ||
      tokenInfo._organisationDetails?.apiKeyDetails?.systemDefaults?.user_id;

    if (!userId) {
      logger.debug(
        'No user ID found in token info, skipping user access check'
      );
      // If there's no user ID, we can't check access - this might be a workspace-level API key
      // Let the downstream handlers decide if this is acceptable
      return next();
    }

    // Check cache first if enabled
    if (enableCache) {
      const cacheKey = getUserAccessCacheKey(workspaceId, serverId, userId);
      try {
        const cache = requestCache();
        const cached = await cache.get<{ allowed: boolean }>(cacheKey);
        if (cached !== null && cached !== undefined) {
          if (cached.allowed) {
            logger.debug(
              `User access allowed (cached): ${userId} -> ${workspaceId}/${serverId}`
            );
            return next();
          } else {
            logger.warn(
              `User access denied (cached): ${userId} -> ${workspaceId}/${serverId}`
            );
            return c.json(
              {
                error: 'forbidden',
                error_description: 'You do not have access to this MCP server',
              },
              403
            );
          }
        }
      } catch (error) {
        logger.warn('Failed to check user access cache', error);
        // Continue with control plane check
      }
    }

    // Call control plane to check user access
    try {
      const result = await controlPlane.checkMcpServerUserAccess(
        workspaceId,
        serverId
      );

      if (result === null) {
        // Control plane request failed
        if (failOpen) {
          logger.warn(
            `User access check failed (fail open): ${userId} -> ${workspaceId}/${serverId}`
          );
          return next();
        } else {
          logger.error(
            `User access check failed (fail closed): ${userId} -> ${workspaceId}/${serverId}`
          );
          return c.json(
            {
              error: 'server_error',
              error_description: 'Unable to verify user access',
            },
            500
          );
        }
      }

      // Cache the result and track the key for invalidation
      if (enableCache) {
        const cacheKey = getUserAccessCacheKey(workspaceId, serverId, userId);
        try {
          const cache = requestCache();
          await cache.set(cacheKey, result, { ttl: USER_ACCESS_CACHE_TTL });

          // Track the cache key for server-based invalidation
          const organisationId = tokenInfo.organisation_id;
          if (organisationId) {
            trackMcpServerUserAccessKey(
              organisationId,
              workspaceId,
              serverId,
              cacheKey
            );
          }
        } catch (error) {
          logger.warn('Failed to cache user access result', error);
        }
      }

      if (result.allowed) {
        logger.debug(
          `User access allowed: ${userId} -> ${workspaceId}/${serverId}`
        );
        return next();
      } else {
        logger.warn(
          `User access denied: ${userId} -> ${workspaceId}/${serverId}`
        );
        return c.json(
          {
            error: 'forbidden',
            error_description: 'You do not have access to this MCP server',
          },
          403
        );
      }
    } catch (error) {
      logger.error('Error checking user access', error);
      if (failOpen) {
        return next();
      }
      return c.json(
        {
          error: 'server_error',
          error_description: 'Unable to verify user access',
        },
        500
      );
    }
  });
}

export default mcpUserAccessMiddleware;
