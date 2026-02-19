import { requestCache } from '../services/cache/cacheService';
import { logger } from '../apm';
import { getRuntimeKey } from 'hono/adapter';
import {
  ThresholdConfig,
  ThresholdIncrementResult,
} from '../services/cache/types';

// In-memory tracking for budget key sets
const inMemoryBudgetKeys: Map<string, Set<string>> = new Map();
const inMemoryActiveOrgIds: Set<string> = new Set();

// In-memory tracking for increments (key → accumulated amount)
const inMemoryIncrements: Map<string, number> = new Map();

// In-memory tracking for prompt cache keys per organization
const inMemoryPromptCacheKeys: Map<string, Set<string>> = new Map();

// Sync interval handle
let isInitialized = false;
let syncIntervalHandle: NodeJS.Timeout | null = null;
let sigTermHandler: (() => void) | null = null;
let sigIntHandler: (() => void) | null = null;

// Constants
const ACTIVE_ORG_IDS_KEY = 'active-budget-org-ids';
const SYNC_INTERVAL_MS = 10 * 1000; // 10 seconds

/**
 * Increment a counter - behavior depends on runtime:
 * - Node.js: Batch in memory, sync to Redis periodically (threshold checks in resyncDataWorker)
 * - Cloudflare: Direct increment via Durable Object with optional threshold checking
 *
 * @param organisationId - Organisation ID for tracking
 * @param key - The counter key
 * @param amount - Amount to increment
 * @param env - Environment bindings
 * @param thresholds - Optional threshold config for checking credit_limit/alert_threshold
 * @returns Promise with threshold result for Cloudflare, undefined for Node.js
 */
export function incrementInMemory(
  organisationId: string,
  key: string,
  amount: number,
  env?: Record<string, any>,
  thresholds?: ThresholdConfig
): Promise<ThresholdIncrementResult> | undefined {
  // Cloudflare Workers: Direct increment via Durable Object
  if (getRuntimeKey() === 'workerd') {
    const cache = requestCache(env);
    return cache
      .incrementWithThreshold(key, amount, thresholds || {})
      .catch((error: any) => {
        logger.error({
          message: `incrementInMemory (workerd) error: ${error.message}`,
          key,
        });
        return {
          value: 0,
          thresholdCrossed: false,
          exhausted: false,
          alertThresholdCrossed: false,
        };
      });
  }

  // Node.js: Batch in memory, sync periodically (threshold checks in resyncDataWorker)
  inMemoryActiveOrgIds.add(organisationId);
  let orgKeys = inMemoryBudgetKeys.get(organisationId);
  if (!orgKeys) {
    orgKeys = new Set();
    inMemoryBudgetKeys.set(organisationId, orgKeys);
  }
  orgKeys.add(key);
  const currentAmount = getPendingIncrement(key);
  inMemoryIncrements.set(key, currentAmount + amount);
  return undefined;
}

/**
 * Get pending (not yet synced) increment for a key
 */
export function getPendingIncrement(key: string): number {
  return inMemoryIncrements.get(key) || 0;
}

/**
 * Generate the Redis Set key for tracking budget keys per organization
 */
export function generateBudgetTrackingSetKey(organisationId: string): string {
  return `active-budget-keys-${organisationId}`;
}

/**
 * Track a prompt cache key in memory (called when caching prompts)
 */
export function trackPromptCacheKey(
  organisationId: string,
  cacheKey: string
): void {
  let orgKeys = inMemoryPromptCacheKeys.get(organisationId);
  if (!orgKeys) {
    orgKeys = new Set();
    inMemoryPromptCacheKeys.set(organisationId, orgKeys);
  }
  orgKeys.add(cacheKey);
}

/**
 * Generate the Redis Set key for tracking prompt cache keys per organization
 */
export function generatePromptCacheTrackingSetKey(
  organisationId: string
): string {
  return `prompt-cache-keys-${organisationId}`;
}

/**
 * Get all tracked prompt cache keys for an organization from Redis
 */
export async function getPromptCacheKeysFromRedis(
  organisationId: string
): Promise<Set<string>> {
  const trackingSetKey = generatePromptCacheTrackingSetKey(organisationId);
  return requestCache().getSetMembers(trackingSetKey);
}

/**
 * Remove prompt cache keys from Redis tracking Set after deletion
 */
export async function removePromptCacheKeysFromRedis(
  organisationId: string,
  keys: string[]
): Promise<void> {
  if (keys.length === 0) return;
  const trackingSetKey = generatePromptCacheTrackingSetKey(organisationId);
  await requestCache().removeFromSet(trackingSetKey, ...keys);
}

/**
 * Sync all in-memory data to Redis (called periodically)
 * This batches operations using Promise.all for KV-compatibility:
 * - Organization IDs into a single SADD
 * - Budget keys into SADD per organization
 * - Prompt cache keys into SADD per organization
 * - Increments via concurrent INCRBYFLOAT calls
 */
export async function syncBudgetKeysToRedis(): Promise<void> {
  const cache = requestCache();
  const promises: Promise<unknown>[] = [];

  // Sync organization IDs (spread Set directly - Sets are iterable)
  if (inMemoryActiveOrgIds.size > 0) {
    promises.push(cache.addToSet(ACTIVE_ORG_IDS_KEY, ...inMemoryActiveOrgIds));
  }

  // Sync budget keys per organization
  for (const [organisationId, keys] of inMemoryBudgetKeys.entries()) {
    if (keys.size === 0) continue;

    const trackingSetKey = generateBudgetTrackingSetKey(organisationId);
    promises.push(cache.addToSet(trackingSetKey, ...keys));
  }

  // Sync prompt cache keys per organization
  for (const [organisationId, keys] of inMemoryPromptCacheKeys.entries()) {
    if (keys.size === 0) continue;

    const trackingSetKey = generatePromptCacheTrackingSetKey(organisationId);
    promises.push(cache.addToSet(trackingSetKey, ...keys));
  }

  // Sync increments using Promise.all (KV-compatible, replaces pipeline)
  for (const [key, amount] of inMemoryIncrements.entries()) {
    if (amount !== 0) {
      promises.push(cache.increment(key, amount));
    }
  }

  await Promise.all(promises);

  // Clear in-memory after sync
  inMemoryActiveOrgIds.clear();
  inMemoryBudgetKeys.clear();
  inMemoryPromptCacheKeys.clear();
  inMemoryIncrements.clear();
}

/**
 * Get all active organization IDs from Redis - O(m) where m = number of orgs
 */
export async function getActiveOrganisationIds(): Promise<Set<string>> {
  return requestCache().getSetMembers(ACTIVE_ORG_IDS_KEY);
}

/**
 * Get all tracked budget keys for an organization from Redis - O(m)
 */
export async function getBudgetKeysFromRedis(
  organisationId: string
): Promise<Set<string>> {
  const trackingSetKey = generateBudgetTrackingSetKey(organisationId);
  return requestCache().getSetMembers(trackingSetKey);
}

/**
 * Remove processed keys from Redis Set after resync
 */
export async function removeBudgetKeysFromRedis(
  organisationId: string,
  keys: string[]
): Promise<void> {
  if (keys.length === 0) return;
  const trackingSetKey = generateBudgetTrackingSetKey(organisationId);
  await requestCache().removeFromSet(trackingSetKey, ...keys);
}

/**
 * Get in-memory tracked org IDs (for combining with Redis data)
 */
export function getInMemoryOrganisationIds(): Set<string> {
  return inMemoryActiveOrgIds;
}

/**
 * Initialize the budget key tracker with periodic sync.
 * This runs on EVERY pod using setInterval (not BullMQ) to ensure
 * each pod's in-memory data is synced to Redis.
 * SADD is idempotent, so multiple pods adding the same key is safe.
 */
export function initCacheKeyTracker(): void {
  if (isInitialized) {
    return;
  }

  // Start periodic sync interval - runs on every pod
  syncIntervalHandle = setInterval(async () => {
    try {
      await syncBudgetKeysToRedis();
    } catch (error) {
      logger.error({
        message: `Budget key sync error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }, SYNC_INTERVAL_MS);

  const gracefulShutdown = async (signal: string) => {
    logger.info({ message: `Received ${signal}, syncing cache keys...` });
    try {
      if (syncIntervalHandle) clearInterval(syncIntervalHandle);
      await syncBudgetKeysToRedis();
      logger.info({ message: `Cache keys synced successfully on ${signal}` });
    } catch (error) {
      logger.error({
        message: `Cache key sync on shutdown error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  };

  sigTermHandler = () => {
    gracefulShutdown('SIGTERM').catch((error) => {
      logger.error({
        message: `Error during SIGTERM graceful shutdown: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    });
  };
  sigIntHandler = () => {
    gracefulShutdown('SIGINT').catch((error) => {
      logger.error({
        message: `Error during SIGINT graceful shutdown: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    });
  };

  process.on('SIGTERM', sigTermHandler);
  process.on('SIGINT', sigIntHandler);

  isInitialized = true;
  logger.info({ message: 'Budget key tracker initialized' });
}

/** Cleanup function for testing or re-initialization */
export function cleanupCacheKeyTracker(): void {
  if (!isInitialized) return;

  if (syncIntervalHandle) clearInterval(syncIntervalHandle);
  if (sigTermHandler) process.removeListener('SIGTERM', sigTermHandler);
  if (sigIntHandler) process.removeListener('SIGINT', sigIntHandler);

  syncIntervalHandle = null;
  sigTermHandler = null;
  sigIntHandler = null;
  isInitialized = false;
}
