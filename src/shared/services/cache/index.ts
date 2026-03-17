/**
 * @file src/services/cache/index.ts
 * Unified cache service with pluggable backends
 */

import {
  CacheBackend,
  CacheEntry,
  CacheOptions,
  CacheStats,
  CacheConfig,
} from './types';
import { MemoryCacheBackend } from './backends/memory';
import { FileCacheBackend } from './backends/file';
import { createRedisBackend } from './backends/redis';
import { createCloudflareKVBackend } from './backends/cloudflareKV';
// Using console.log for now to avoid build issues
const logger = {
  debug: (msg: string, ...args: any[]) =>
    console.debug(`[CacheService] ${msg}`, ...args),
  info: (msg: string, ...args: any[]) =>
    console.info(`[CacheService] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) =>
    console.warn(`[CacheService] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) =>
    console.error(`[CacheService] ${msg}`, ...args),
};

const MS = {
  '1_MINUTE': 1 * 60 * 1000,
  '5_MINUTES': 5 * 60 * 1000,
  '10_MINUTES': 10 * 60 * 1000,
  '30_MINUTES': 30 * 60 * 1000,
  '1_HOUR': 60 * 60 * 1000,
  '6_HOURS': 6 * 60 * 60 * 1000,
  '12_HOURS': 12 * 60 * 60 * 1000,
  '1_DAY': 24 * 60 * 60 * 1000,
  '7_DAYS': 7 * 24 * 60 * 60 * 1000,
  '30_DAYS': 30 * 24 * 60 * 60 * 1000,
};

export class CacheService {
  private backend: CacheBackend;
  private defaultTtl?: number;

  constructor(config: CacheConfig) {
    this.defaultTtl = config.defaultTtl;
    this.backend = this.createBackend(config);
  }

  private createBackend(config: CacheConfig): CacheBackend {
    switch (config.backend) {
      case 'memory':
        return new MemoryCacheBackend(config.maxSize, config.cleanupInterval);

      case 'file':
        return new FileCacheBackend(
          config.dataDir,
          config.fileName,
          config.saveInterval,
          config.cleanupInterval
        );

      case 'redis':
        if (!config.redisUrl) {
          throw new Error('Redis URL is required for Redis backend');
        }
        return createRedisBackend(config.redisUrl, {
          ...config.redisOptions,
          dbName: config.dbName || 'cache',
        });

      case 'cloudflareKV':
        if (!config.kvBindingName || !config.dbName) {
          throw new Error(
            'Cloudflare KV binding name and db name are required for Cloudflare KV backend'
          );
        }
        return createCloudflareKVBackend(
          config.env,
          config.kvBindingName,
          config.dbName
        );

      default:
        throw new Error(`Unsupported cache backend: ${config.backend}`);
    }
  }

  /**
   * Get a value from the cache
   */
  async get<T = any>(key: string, namespace?: string): Promise<T | null> {
    const entry = await this.backend.get<T>(key, namespace);
    return entry ? entry.value : null;
  }

  /**
   * Get the full cache entry (with metadata)
   */
  async getEntry<T = any>(
    key: string,
    namespace?: string
  ): Promise<CacheEntry<T> | null> {
    return this.backend.get<T>(key, namespace);
  }

  /**
   * Set a value in the cache
   */
  async set<T = any>(
    key: string,
    value: T,
    options: CacheOptions = {}
  ): Promise<void> {
    const finalOptions = {
      ...options,
      ttl: options.ttl ?? this.defaultTtl,
    };

    await this.backend.set(key, value, finalOptions);
  }

  /**
   * Set a value with TTL in seconds (convenience method)
   */
  async setWithTtl<T = any>(
    key: string,
    value: T,
    ttlSeconds: number,
    namespace?: string
  ): Promise<void> {
    await this.set(key, value, {
      ttl: ttlSeconds * 1000,
      namespace,
    });
  }

  /**
   * Delete a value from the cache
   */
  async delete(key: string, namespace?: string): Promise<boolean> {
    return this.backend.delete(key, namespace);
  }

  /**
   * Check if a key exists in the cache
   */
  async has(key: string, namespace?: string): Promise<boolean> {
    return this.backend.has(key, namespace);
  }

  /**
   * Get all keys in a namespace
   */
  async keys(namespace?: string): Promise<string[]> {
    return this.backend.keys(namespace);
  }

  /**
   * Clear all entries in a namespace (or all entries if no namespace)
   */
  async clear(namespace?: string): Promise<void> {
    await this.backend.clear(namespace);
  }

  /**
   * Get cache statistics
   */
  async getStats(namespace?: string): Promise<CacheStats> {
    return this.backend.getStats(namespace);
  }

  /**
   * Manually trigger cleanup of expired entries
   */
  async cleanup(): Promise<void> {
    await this.backend.cleanup();
  }

  /**
   * Wait for the backend to be ready
   */
  async waitForReady(): Promise<void> {
    if ('waitForReady' in this.backend) {
      await (this.backend as any).waitForReady();
    }
  }

  /**
   * Close the cache and cleanup resources
   */
  async close(): Promise<void> {
    await this.backend.close();
  }

  /**
   * Get or set pattern - get value, or compute and cache it if not found
   */
  async getOrSet<T = any>(
    key: string,
    factory: () => Promise<T> | T,
    options: CacheOptions = {}
  ): Promise<T> {
    const existing = await this.get<T>(key, options.namespace);
    if (existing !== null) {
      return existing;
    }

    const value = await factory();
    await this.set(key, value, options);
    return value;
  }

  /**
   * Increment a numeric value (atomic operation for supported backends)
   */
  async increment(
    key: string,
    delta: number = 1,
    options: CacheOptions = {}
  ): Promise<number> {
    // For backends that don't support atomic increment, we simulate it
    const current = (await this.get<number>(key, options.namespace)) || 0;
    const newValue = current + delta;
    await this.set(key, newValue, options);
    return newValue;
  }

  /**
   * Set multiple values at once
   */
  async setMany<T = any>(
    entries: Array<{ key: string; value: T; options?: CacheOptions }>,
    defaultOptions: CacheOptions = {}
  ): Promise<void> {
    const promises = entries.map(({ key, value, options }) =>
      this.set(key, value, { ...defaultOptions, ...options })
    );
    await Promise.all(promises);
  }

  /**
   * Get multiple values at once
   */
  async getMany<T = any>(
    keys: string[],
    namespace?: string
  ): Promise<Array<{ key: string; value: T | null }>> {
    const promises = keys.map(async (key) => ({
      key,
      value: await this.get<T>(key, namespace),
    }));
    return Promise.all(promises);
  }

  getClient(): CacheBackend {
    return this.backend;
  }
}

// Default cache instances for different use cases
let defaultCache: CacheService | null = null;
let tokenCache: CacheService | null = null;
let sessionCache: CacheService | null = null;
let configCache: CacheService | null = null;
let oauthStore: CacheService | null = null;
let mcpServersCache: CacheService | null = null;
let apiRateLimiterCache: CacheService | null = null;
/**
 * Get or create the default cache instance
 */
export function getDefaultCache(): CacheService {
  if (!defaultCache) {
    throw new Error('Default cache instance not found');
  }
  return defaultCache;
}

/**
 * Get or create the token cache instance
 */
export function getTokenCache(): CacheService {
  if (!tokenCache) {
    throw new Error('Token cache instance not found');
  }
  return tokenCache;
}

/**
 * Get or create the session cache instance
 */
export function getSessionCache(): CacheService {
  if (!sessionCache) {
    throw new Error('Session cache instance not found');
  }
  return sessionCache;
}

/**
 * Get or create the token introspection cache instance
 */
export function getTokenIntrospectionCache(): CacheService {
  // Use the same cache as tokens, just different namespace
  return getTokenCache();
}

/**
 * Get or create the config cache instance
 */
export function getConfigCache(): CacheService {
  if (!configCache) {
    throw new Error('Config cache instance not found');
  }
  return configCache;
}

/**
 * Get or create the oauth store cache instance
 */
export function getOauthStore(): CacheService {
  if (!oauthStore) {
    throw new Error('Oauth store cache instance not found');
  }
  return oauthStore;
}

export function getMcpServersCache(): CacheService {
  if (!mcpServersCache) {
    throw new Error('Mcp servers cache instance not found');
  }
  return mcpServersCache;
}

/**
 * Initialize cache with custom configuration
 */
export function initializeCache(config: CacheConfig): CacheService {
  return new CacheService(config);
}

export async function createCacheBackendsLocal(): Promise<void> {
  defaultCache = new CacheService({
    backend: 'memory',
    defaultTtl: MS['5_MINUTES'],
    cleanupInterval: MS['5_MINUTES'],
    maxSize: 1000,
  });

  tokenCache = new CacheService({
    backend: 'memory',
    defaultTtl: MS['5_MINUTES'],
    saveInterval: 1000, // 1 second
    cleanupInterval: MS['5_MINUTES'],
    maxSize: 1000,
  });

  sessionCache = new CacheService({
    backend: 'file',
    dataDir: 'data',
    fileName: 'sessions-cache.json',
    defaultTtl: MS['30_MINUTES'],
    saveInterval: 1000, // 1 second
    cleanupInterval: MS['5_MINUTES'],
  });
  await sessionCache.waitForReady();

  configCache = new CacheService({
    backend: 'memory',
    defaultTtl: MS['30_DAYS'],
    cleanupInterval: MS['5_MINUTES'],
    maxSize: 100,
  });

  oauthStore = new CacheService({
    backend: 'file',
    dataDir: 'data',
    fileName: 'oauth-store.json',
    saveInterval: 1000, // 1 second
    cleanupInterval: MS['10_MINUTES'],
  });
  await oauthStore.waitForReady();

  mcpServersCache = new CacheService({
    backend: 'file',
    dataDir: 'data',
    fileName: 'mcp-servers-auth.json',
    saveInterval: 1000, // 5 seconds
    cleanupInterval: MS['5_MINUTES'],
  });
  await mcpServersCache.waitForReady();
}

export function createCacheBackendsRedis(redisUrl: string): void {
  logger.info('Creating cache backends with Redis', redisUrl);
  let commonOptions: CacheConfig = {
    backend: 'redis',
    redisUrl: redisUrl,
    defaultTtl: MS['5_MINUTES'],
    cleanupInterval: MS['5_MINUTES'],
    maxSize: 1000,
  };

  defaultCache = new CacheService({
    ...commonOptions,
    dbName: 'default',
  });

  tokenCache = new CacheService({
    backend: 'memory',
    defaultTtl: MS['1_MINUTE'],
    cleanupInterval: MS['1_MINUTE'],
    maxSize: 1000,
  });

  sessionCache = new CacheService({
    ...commonOptions,
    dbName: 'session',
  });

  configCache = new CacheService({
    ...commonOptions,
    dbName: 'config',
    defaultTtl: undefined,
  });

  oauthStore = new CacheService({
    ...commonOptions,
    dbName: 'oauth',
    defaultTtl: undefined,
  });

  mcpServersCache = new CacheService({
    ...commonOptions,
    dbName: 'mcp',
    defaultTtl: undefined,
  });
}

export function createCacheBackendsCF(env: any): void {
  let commonOptions: CacheConfig = {
    backend: 'cloudflareKV',
    env: env,
    kvBindingName: 'KV_STORE',
    defaultTtl: MS['5_MINUTES'],
  };
  defaultCache = new CacheService({
    ...commonOptions,
    dbName: 'default',
  });

  tokenCache = new CacheService({
    ...commonOptions,
    dbName: 'token',
    defaultTtl: MS['10_MINUTES'],
  });

  sessionCache = new CacheService({
    ...commonOptions,
    dbName: 'session',
  });

  configCache = new CacheService({
    ...commonOptions,
    dbName: 'config',
    defaultTtl: MS['30_DAYS'],
  });

  oauthStore = new CacheService({
    ...commonOptions,
    dbName: 'oauth',
    defaultTtl: undefined,
  });

  mcpServersCache = new CacheService({
    ...commonOptions,
    dbName: 'mcp',
    defaultTtl: undefined,
  });

  apiRateLimiterCache = new CacheService({
    ...commonOptions,
    kvBindingName: 'API_RATE_LIMITER',
    dbName: 'api-rate-limiter',
    defaultTtl: undefined,
  });
}

// Re-export types for convenience
export * from './types';
