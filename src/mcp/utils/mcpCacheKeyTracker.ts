/**
 * @file src/mcp/utils/mcpCacheKeyTracker.ts
 * MCP-specific cache key tracking for token invalidation
 * This module is separate from the main cacheKeyTracker to allow conditional initialization
 */

import { requestCache } from '../../services/cache/cacheService';
import { logger } from '../../apm';

// In-memory tracking for MCP server token keys per server
// Key format: `{organisationId}:{workspaceId}:{serverId}`
const inMemoryMcpServerTokenKeys: Map<string, Set<string>> = new Map();

// In-memory tracking for MCP server user access keys per server
// Key format: `{organisationId}:{workspaceId}:{serverId}`
const inMemoryMcpServerUserAccessKeys: Map<string, Set<string>> = new Map();

// Sync interval handle
let isInitialized = false;
let syncIntervalHandle: NodeJS.Timeout | null = null;

// Constants
const SYNC_INTERVAL_MS = 10 * 1000; // 10 seconds

/**
 * Generate the unique key for an MCP server (used as part of tracking Set key)
 */
export function generateMcpServerKey(
  organisationId: string,
  workspaceId: string,
  serverId: string
): string {
  return `${organisationId}:${workspaceId}:${serverId}`;
}

/**
 * Generate the Redis Set key for tracking token keys per MCP server
 */
export function generateMcpServerTokenTrackingSetKey(
  organisationId: string,
  workspaceId: string,
  serverId: string
): string {
  return `mcp-server-tokens:${organisationId}:${workspaceId}:${serverId}`;
}

/**
 * Generate the Redis Set key for tracking user access keys per MCP server
 */
export function generateMcpServerUserAccessTrackingSetKey(
  organisationId: string,
  workspaceId: string,
  serverId: string
): string {
  return `mcp-server-user-access:${organisationId}:${workspaceId}:${serverId}`;
}

/**
 * Track an MCP server token key in memory (called when caching tokens)
 * @param organisationId - Organisation ID
 * @param workspaceId - Workspace ID
 * @param serverId - MCP Server ID
 * @param tokenCacheKey - The full cache key for the token
 */
export function trackMcpServerTokenKey(
  organisationId: string,
  workspaceId: string,
  serverId: string,
  tokenCacheKey: string
): void {
  const serverKey = generateMcpServerKey(organisationId, workspaceId, serverId);
  let serverTokenKeys = inMemoryMcpServerTokenKeys.get(serverKey);
  if (!serverTokenKeys) {
    serverTokenKeys = new Set();
    inMemoryMcpServerTokenKeys.set(serverKey, serverTokenKeys);
  }
  serverTokenKeys.add(tokenCacheKey);
}

/**
 * Track an MCP server user access key in memory (called when caching user access checks)
 * @param organisationId - Organisation ID
 * @param workspaceId - Workspace ID
 * @param serverId - MCP Server ID
 * @param userAccessCacheKey - The full cache key for the user access check
 */
export function trackMcpServerUserAccessKey(
  organisationId: string,
  workspaceId: string,
  serverId: string,
  userAccessCacheKey: string
): void {
  const serverKey = generateMcpServerKey(organisationId, workspaceId, serverId);
  let serverUserAccessKeys = inMemoryMcpServerUserAccessKeys.get(serverKey);
  if (!serverUserAccessKeys) {
    serverUserAccessKeys = new Set();
    inMemoryMcpServerUserAccessKeys.set(serverKey, serverUserAccessKeys);
  }
  serverUserAccessKeys.add(userAccessCacheKey);
}

/**
 * Get all tracked token cache keys for an MCP server from Redis
 */
export async function getMcpServerTokenKeysFromRedis(
  organisationId: string,
  workspaceId: string,
  serverId: string
): Promise<Set<string>> {
  const trackingSetKey = generateMcpServerTokenTrackingSetKey(
    organisationId,
    workspaceId,
    serverId
  );
  return requestCache().getSetMembers(trackingSetKey);
}

/**
 * Remove MCP server token keys from Redis tracking Set after deletion
 */
export async function removeMcpServerTokenKeysFromRedis(
  organisationId: string,
  workspaceId: string,
  serverId: string,
  keys: string[]
): Promise<void> {
  if (keys.length === 0) return;
  const trackingSetKey = generateMcpServerTokenTrackingSetKey(
    organisationId,
    workspaceId,
    serverId
  );
  await requestCache().removeFromSet(trackingSetKey, ...keys);
}

/**
 * Clear all tracked token keys for an MCP server from Redis
 * (Used when server is deleted or all tokens need to be invalidated)
 */
export async function clearMcpServerTokenTrackingSet(
  organisationId: string,
  workspaceId: string,
  serverId: string
): Promise<void> {
  const trackingSetKey = generateMcpServerTokenTrackingSetKey(
    organisationId,
    workspaceId,
    serverId
  );
  // Delete the entire Set
  await requestCache().delete(trackingSetKey);
}

/**
 * Get all tracked user access cache keys for an MCP server from Redis
 */
export async function getMcpServerUserAccessKeysFromRedis(
  organisationId: string,
  workspaceId: string,
  serverId: string
): Promise<Set<string>> {
  const trackingSetKey = generateMcpServerUserAccessTrackingSetKey(
    organisationId,
    workspaceId,
    serverId
  );
  return requestCache().getSetMembers(trackingSetKey);
}

/**
 * Clear all tracked user access keys for an MCP server from Redis
 * (Used when server user access rules are changed)
 */
export async function clearMcpServerUserAccessTrackingSet(
  organisationId: string,
  workspaceId: string,
  serverId: string
): Promise<void> {
  const trackingSetKey = generateMcpServerUserAccessTrackingSetKey(
    organisationId,
    workspaceId,
    serverId
  );
  // Delete the entire Set
  await requestCache().delete(trackingSetKey);
}

/**
 * Sync all in-memory MCP token keys to Redis
 */
export async function syncMcpTokenKeysToRedis(): Promise<void> {
  const cache = requestCache();
  const promises: Promise<unknown>[] = [];

  // Sync token keys
  if (inMemoryMcpServerTokenKeys.size > 0) {
    for (const [serverKey, keys] of inMemoryMcpServerTokenKeys.entries()) {
      if (keys.size === 0) continue;

      // serverKey format: `{organisationId}:{workspaceId}:{serverId}`
      const [organisationId, workspaceId, serverId] = serverKey.split(':');
      const trackingSetKey = generateMcpServerTokenTrackingSetKey(
        organisationId,
        workspaceId,
        serverId
      );
      promises.push(cache.addToSet(trackingSetKey, ...keys));
    }
    inMemoryMcpServerTokenKeys.clear();
  }

  // Sync user access keys
  if (inMemoryMcpServerUserAccessKeys.size > 0) {
    for (const [serverKey, keys] of inMemoryMcpServerUserAccessKeys.entries()) {
      if (keys.size === 0) continue;

      // serverKey format: `{organisationId}:{workspaceId}:{serverId}`
      const [organisationId, workspaceId, serverId] = serverKey.split(':');
      const trackingSetKey = generateMcpServerUserAccessTrackingSetKey(
        organisationId,
        workspaceId,
        serverId
      );
      promises.push(cache.addToSet(trackingSetKey, ...keys));
    }
    inMemoryMcpServerUserAccessKeys.clear();
  }

  if (promises.length > 0) {
    await Promise.all(promises);
  }
}

/**
 * Initialize the MCP cache key tracker with periodic sync.
 * Call this only when MCP module is being used.
 */
export function initMcpCacheKeyTracker(): void {
  if (isInitialized) {
    return;
  }

  // Start periodic sync interval
  syncIntervalHandle = setInterval(async () => {
    try {
      await syncMcpTokenKeysToRedis();
    } catch (error) {
      logger.error({
        message: `MCP token key sync error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }, SYNC_INTERVAL_MS);

  // Register cleanup on shutdown
  const gracefulShutdown = async (signal: string) => {
    logger.info({
      message: `MCP tracker received ${signal}, syncing token keys...`,
    });
    try {
      if (syncIntervalHandle) clearInterval(syncIntervalHandle);
      await syncMcpTokenKeysToRedis();
      logger.info({
        message: `MCP token keys synced successfully on ${signal}`,
      });
    } catch (error) {
      logger.error({
        message: `MCP token key sync on shutdown error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  isInitialized = true;
  logger.info({ message: 'MCP cache key tracker initialized' });
}

/**
 * Check if the MCP cache key tracker is initialized
 */
export function isMcpCacheKeyTrackerInitialized(): boolean {
  return isInitialized;
}

/**
 * Cleanup function for testing or shutdown
 */
export function cleanupMcpCacheKeyTracker(): void {
  if (!isInitialized) return;

  if (syncIntervalHandle) {
    clearInterval(syncIntervalHandle);
    syncIntervalHandle = null;
  }

  inMemoryMcpServerTokenKeys.clear();
  inMemoryMcpServerUserAccessKeys.clear();
  isInitialized = false;
}
