/**
 * @file src/mcp/routes/sync.ts
 * MCP Sync API - Accepts data from control plane and invalidates MCP caches
 * Uses the same data format as syncDataWorker but only handles MCP-related keys
 */

import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { createLogger } from '../../shared/utils/logger';
import { getConfigCache } from '../services/mcpCacheService';
import { requestCache } from '../../services/cache/cacheService';
import {
  getMcpServerTokenKeysFromRedis,
  clearMcpServerTokenTrackingSet,
  getMcpServerUserAccessKeysFromRedis,
  clearMcpServerUserAccessTrackingSet,
} from '../utils/mcpCacheKeyTracker';
import { invalidateServerCache } from '../services/mcpAccessService';
import { getConnectionPool } from '../services/upstreamConnectionPool';
import { Environment } from '../../utils/env';
import { generateV2CacheKey } from '../../utils/cacheKey';
import { CacheKeyTypes } from '../../middlewares/portkey/globals';
import { runInBatches } from '../../utils/misc';

const logger = createLogger('SyncRoutes');

/**
 * MCP Server entity format (matches sync worker format)
 */
interface McpServerEntityV2 {
  /** Server ID (slug) */
  slug: string;
  /** Workspace ID */
  workspace_id: string;
  /** If true, invalidate all cached tokens for this server (core details changed) */
  reset_tokens?: boolean;
  /** If true, invalidate capabilities cache for this server (disabled capabilities changed) */
  reset_capabilities?: boolean;
  /** If true, invalidate ALL user access cache for this server (user access rules changed) */
  reset_user_access?: boolean;
}

/**
 * Sync data format for MCP (subset of SyncTransactionDataFormat)
 */
interface McpSyncDataFormat {
  /** Organisation ID for this sync request */
  organisation_id: string;
  /** MCP servers that have been updated */
  mcpServersV2?: McpServerEntityV2[];
  apiKeyIds?: string[];
}

type Env = {
  Variables: {
    controlPlane?: any;
  };
};

const syncRoutes = new Hono<Env>();

/**
 * Check if this is a managed SaaS deployment
 */
const isManagedDeployment = (): boolean => {
  return Environment({}).MANAGED_DEPLOYMENT === 'ON';
};

/**
 * Check if sync routes are explicitly enabled via environment variable
 */
const isSyncRoutesEnabled = (): boolean => {
  return Environment({}).MCP_SYNC_ROUTES_ENABLED === 'true';
};

/**
 * Get the expected sync auth token from environment
 */
const getSyncAuthToken = (): string | undefined => {
  return Environment({}).MCP_SYNC_AUTH_TOKEN;
};

/**
 * Middleware to restrict sync routes:
 * 1. Must be a managed deployment
 * 2. MCP_SYNC_ROUTES_ENABLED must be 'true'
 * 3. Authorization header must match MCP_SYNC_AUTH_TOKEN
 */
const syncRoutesEnabledMiddleware = createMiddleware(async (c, next) => {
  // Check if managed deployment
  if (!isManagedDeployment()) {
    logger.warn(`Sync route accessed in non-managed deployment: ${c.req.path}`);
    return c.json(
      {
        error: 'forbidden',
        error_description:
          'Sync routes are only available for managed deployments.',
      },
      403
    );
  }

  // Check if sync routes are enabled
  if (!isSyncRoutesEnabled()) {
    logger.warn(
      `Sync route accessed but MCP_SYNC_ROUTES_ENABLED is not enabled: ${c.req.path}`
    );
    return c.json(
      {
        error: 'forbidden',
        error_description:
          'Sync routes are not enabled. Set MCP_SYNC_ROUTES_ENABLED=true to enable.',
      },
      403
    );
  }

  // Check authorization header
  const expectedToken = getSyncAuthToken();
  if (!expectedToken) {
    logger.warn(
      `Sync route accessed but MCP_SYNC_AUTH_TOKEN is not configured: ${c.req.path}`
    );
    return c.json(
      {
        error: 'server_error',
        error_description:
          'Sync routes are not properly configured. MCP_SYNC_AUTH_TOKEN is required.',
      },
      500
    );
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    return c.json(
      {
        error: 'unauthorized',
        error_description: 'Authorization header is required.',
      },
      401
    );
  }

  // Support both "Bearer <token>" and raw token
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  if (token !== expectedToken) {
    logger.warn(`Sync route accessed with invalid auth token: ${c.req.path}`);
    return c.json(
      {
        error: 'unauthorized',
        error_description: 'Invalid authorization token.',
      },
      401
    );
  }

  return next();
});

// Apply sync routes enabled middleware to all sync routes
syncRoutes.use('*', syncRoutesEnabledMiddleware);

/**
 * POST /sync
 * Sync MCP server data - invalidates caches based on provided data
 * Accepts same format as control plane sync endpoint
 */
syncRoutes.post('/', async (c) => {
  try {
    const data: McpSyncDataFormat = await c.req.json();
    logger.debug('sync data', data);

    if (!data.organisation_id) {
      return c.json(
        {
          error: 'bad_request',
          error_description: 'organisation_id is required',
        },
        400
      );
    }

    const organisationId = data.organisation_id;
    const configCache = getConfigCache();
    const cache = requestCache();
    const results: Array<{
      server_id: string;
      workspace_id: string;
      success: boolean;
      invalidated: string[];
      errors: string[];
    }> = [];

    let totalInvalidated = 0;
    let totalErrors = 0;

    // Process MCP servers
    if (data.mcpServersV2?.length) {
      for (const item of data.mcpServersV2) {
        const serverId = item.slug;
        const workspaceId = item.workspace_id;
        const invalidated: string[] = [];
        const errors: string[] = [];
        let success = true;

        // 1. Invalidate MCP server config cache
        // The MCP config cache key format is: `{workspaceId}/{serverId}`
        const configCacheKey = `${workspaceId}/${serverId}`;
        try {
          await configCache.delete(configCacheKey);
          invalidated.push(`config:${configCacheKey}`);
          logger.info(
            `Invalidated MCP config cache for ${workspaceId}/${serverId} (org: ${organisationId})`
          );

          // Also invalidate pooled connections for this server
          // Server config changes (URL, auth, etc.) require fresh connections
          try {
            const pool = getConnectionPool();
            const pooledRemoved = await pool.removeByServer(
              workspaceId,
              serverId
            );
            if (pooledRemoved > 0) {
              invalidated.push(
                `pool:${workspaceId}:${serverId}:* (${pooledRemoved} connections)`
              );
              logger.info(
                `Removed ${pooledRemoved} pooled connections for config change: ${workspaceId}/${serverId}`
              );
            }
          } catch (poolError: any) {
            logger.error(
              `Failed to invalidate pool connections for ${workspaceId}/${serverId}: ${poolError.message}`
            );
            // Don't fail the overall operation for pool errors
          }
        } catch (error: any) {
          logger.error(
            `Failed to invalidate config cache for ${workspaceId}/${serverId}: ${error.message}`
          );
          errors.push(`Config cache invalidation failed: ${error.message}`);
          success = false;
        }

        // 2. If reset_tokens flag is set, invalidate all cached tokens for this server
        if (item.reset_tokens) {
          logger.info(
            `Invalidating all tokens for MCP server ${workspaceId}/${serverId} (org: ${organisationId})`
          );

          try {
            // Get all tracked token keys for this server
            const trackedTokenKeys = await getMcpServerTokenKeysFromRedis(
              organisationId,
              workspaceId,
              serverId
            );

            // Delete each tracked token
            for (const tokenKey of trackedTokenKeys) {
              try {
                await cache.delete(tokenKey);
                invalidated.push(`token:${tokenKey}`);
              } catch (tokenError: any) {
                logger.error(
                  `Failed to delete token ${tokenKey}: ${tokenError.message}`
                );
                errors.push(
                  `Token deletion failed for ${tokenKey}: ${tokenError.message}`
                );
                success = false;
              }
            }

            // Clear the tracking Set for this server
            await clearMcpServerTokenTrackingSet(
              organisationId,
              workspaceId,
              serverId
            );
            invalidated.push(
              `tracking:mcp-server-tokens:${organisationId}:${workspaceId}:${serverId}`
            );
          } catch (error: any) {
            logger.error(
              `Failed to invalidate tokens for ${workspaceId}/${serverId}: ${error.message}`
            );
            errors.push(`Token invalidation failed: ${error.message}`);
            success = false;
          }
        }

        // 3. If reset_capabilities flag is set, invalidate capabilities cache for this server
        if (item.reset_capabilities) {
          logger.info(
            `Invalidating capabilities cache for MCP server ${workspaceId}/${serverId} (org: ${organisationId})`
          );

          try {
            await invalidateServerCache(serverId, workspaceId);
            invalidated.push(
              `capabilities:mcp:disabled:${workspaceId}:${serverId}`
            );
          } catch (error: any) {
            logger.error(
              `Failed to invalidate capabilities cache for ${workspaceId}/${serverId}: ${error.message}`
            );
            errors.push(
              `Capabilities cache invalidation failed: ${error.message}`
            );
            success = false;
          }
        }

        // 4. If reset_user_access is set, invalidate ALL user access cache for this server
        if (item.reset_user_access) {
          logger.info(
            `Invalidating all user access cache for MCP server ${workspaceId}/${serverId} (org: ${organisationId})`
          );

          try {
            // Get all tracked user access keys for this server
            const trackedUserAccessKeys =
              await getMcpServerUserAccessKeysFromRedis(
                organisationId,
                workspaceId,
                serverId
              );

            // Delete each tracked user access cache key
            let deletedCount = 0;
            for (const userAccessKey of trackedUserAccessKeys) {
              try {
                await cache.delete(userAccessKey);
                deletedCount++;
              } catch (keyError: any) {
                logger.error(
                  `Failed to delete user access key ${userAccessKey}: ${keyError.message}`
                );
                errors.push(
                  `User access key deletion failed for ${userAccessKey}: ${keyError.message}`
                );
                success = false;
              }
            }

            // Clear the tracking Set for this server
            await clearMcpServerUserAccessTrackingSet(
              organisationId,
              workspaceId,
              serverId
            );

            invalidated.push(
              `user-access:${workspaceId}:${serverId}:* (${deletedCount} keys)`
            );
            logger.info(
              `Deleted ${deletedCount} user access cache keys for ${workspaceId}/${serverId}`
            );

            // Also invalidate pooled connections for this server
            // This ensures revoked users can't reuse existing connections
            try {
              const pool = getConnectionPool();
              const pooledRemoved = await pool.removeByServer(
                workspaceId,
                serverId
              );
              if (pooledRemoved > 0) {
                invalidated.push(
                  `pool:${workspaceId}:${serverId}:* (${pooledRemoved} connections)`
                );
                logger.info(
                  `Removed ${pooledRemoved} pooled connections for ${workspaceId}/${serverId}`
                );
              }
            } catch (poolError: any) {
              logger.error(
                `Failed to invalidate pool connections for ${workspaceId}/${serverId}: ${poolError.message}`
              );
              errors.push(
                `Pool connection invalidation failed: ${poolError.message}`
              );
              // Don't fail the overall operation for pool errors
            }
          } catch (error: any) {
            logger.error(
              `Failed to invalidate user access cache for ${workspaceId}/${serverId}: ${error.message}`
            );
            errors.push(
              `User access cache invalidation failed: ${error.message}`
            );
            success = false;
          }
        }

        totalInvalidated += invalidated.length;
        totalErrors += errors.length;

        results.push({
          server_id: serverId,
          workspace_id: workspaceId,
          success,
          invalidated,
          errors,
        });
      }
    }

    if (data.apiKeyIds?.length) {
      const apiKeyIdPromises: Promise<{ key: string } | null>[] = [];
      const apiKeyIds: string[] = [];
      const resetPromises: Promise<unknown>[] = [];
      data.apiKeyIds?.forEach((id) => {
        const cacheKey = generateV2CacheKey({
          cacheKeyType: CacheKeyTypes.API_KEY_ID,
          key: id,
        });
        apiKeyIdPromises.push(cache.get(cacheKey));
        apiKeyIds.push(id);
      });

      const apiKeyIdToKeyResults: ({ key: string } | null)[] =
        await runInBatches(50, apiKeyIds.length, async (j) => {
          return apiKeyIdPromises[j];
        });
      const apiKeyIdToKeyData = apiKeyIdToKeyResults.filter(Boolean);

      for (let j = 0; j < apiKeyIdToKeyData.length; j++) {
        const apiIdKeyData = apiKeyIdToKeyData[j];
        if (apiIdKeyData?.key) {
          const cacheKey = generateV2CacheKey({
            cacheKeyType: CacheKeyTypes.API_KEY,
            key: apiIdKeyData?.key,
          });
          resetPromises.push(cache.delete(cacheKey));
        }
      }

      await runInBatches(50, resetPromises.length, (j) => resetPromises[j]);

      // Also invalidate pooled connections for revoked API keys
      // API key ID is used as userId in the connection pool
      const pool = getConnectionPool();
      let totalPooledRemoved = 0;
      for (const apiKeyId of data.apiKeyIds) {
        try {
          const removed = await pool.removeByUserId(apiKeyId);
          totalPooledRemoved += removed;
        } catch (poolError: any) {
          logger.error(
            `Failed to invalidate pool connections for API key ${apiKeyId}: ${poolError.message}`
          );
          // Don't fail the overall operation for pool errors
        }
      }
      if (totalPooledRemoved > 0) {
        logger.info(
          `Removed ${totalPooledRemoved} pooled connections for ${data.apiKeyIds.length} revoked API keys`
        );
      }
    }

    const overallSuccess = totalErrors === 0;

    return c.json(
      {
        success: overallSuccess,
        message: overallSuccess
          ? 'MCP sync completed successfully'
          : 'MCP sync completed with errors',
        organisation_id: organisationId,
        summary: {
          servers_processed: results.length,
          total_invalidated: totalInvalidated,
          total_errors: totalErrors,
        },
        results,
      },
      overallSuccess ? 200 : 207
    );
  } catch (error: any) {
    logger.error(`MCP sync error: ${error.message}`, error);
    return c.json(
      {
        error: 'internal_error',
        error_description: error.message,
      },
      500
    );
  }
});

export default syncRoutes;
