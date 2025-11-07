/**
 * @file src/services/cache/backends/redis.ts
 * Redis cache backend implementation
 */
import Redis from 'ioredis';

import { CacheBackend, CacheEntry, CacheOptions, CacheStats } from '../types';

type RedisClient = Redis;

// Using console.log for now to avoid build issues
const logger = {
  debug: (msg: string, ...args: any[]) =>
    console.debug(`[RedisCache] ${msg}`, ...args),
  info: (msg: string, ...args: any[]) =>
    console.info(`[RedisCache] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) =>
    console.warn(`[RedisCache] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) =>
    console.error(`[RedisCache] ${msg}`, ...args),
};

export class RedisCacheBackend implements CacheBackend {
  private client: RedisClient;
  private dbName: string;

  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    size: 0,
    expired: 0,
  };

  constructor(client: RedisClient, dbName: string) {
    this.client = client;
    this.dbName = dbName;
  }

  private serializeEntry<T>(entry: CacheEntry<T>): string {
    return JSON.stringify(entry);
  }

  private deserializeEntry<T>(data: string): CacheEntry<T> {
    return JSON.parse(data);
  }

  private isExpired(entry: CacheEntry): boolean {
    return entry.expiresAt !== undefined && entry.expiresAt <= Date.now();
  }

  getFullKey(key: string, namespace?: string): string {
    return namespace
      ? `${this.dbName}:${namespace}:${key}`
      : `${this.dbName}:default:${key}`;
  }

  async get<T = any>(
    key: string,
    namespace?: string
  ): Promise<CacheEntry<T> | null> {
    try {
      const fullKey = this.getFullKey(key, namespace);
      const data = await this.client.get(fullKey);

      if (!data) {
        this.stats.misses++;
        return null;
      }

      const entry = this.deserializeEntry<T>(data);

      // Double-check expiration (Redis TTL should handle this, but just in case)
      if (this.isExpired(entry)) {
        await this.client.del(fullKey);
        this.stats.expired++;
        this.stats.misses++;
        return null;
      }

      this.stats.hits++;
      return entry;
    } catch (error) {
      logger.error('Redis get error:', error);
      this.stats.misses++;
      return null;
    }
  }

  async set<T = any>(
    key: string,
    value: T,
    options: CacheOptions = {}
  ): Promise<void> {
    try {
      const fullKey = this.getFullKey(key, options.namespace);
      const now = Date.now();

      const entry: CacheEntry<T> = {
        value,
        createdAt: now,
        expiresAt: options.ttl ? now + options.ttl : undefined,
        metadata: options.metadata,
      };

      const serialized = this.serializeEntry(entry);

      if (options.ttl) {
        // Set with TTL in seconds
        const ttlSeconds = Math.ceil(options.ttl / 1000);
        await this.client.set(fullKey, serialized, 'EX', ttlSeconds);
      } else {
        await this.client.set(fullKey, serialized);
      }

      this.stats.sets++;
    } catch (error) {
      logger.error('Redis set error:', error);
      throw error;
    }
  }

  async delete(key: string, namespace?: string): Promise<boolean> {
    try {
      const fullKey = this.getFullKey(key, namespace);
      const deleted = await this.client.del(fullKey);

      if (deleted > 0) {
        this.stats.deletes++;
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Redis delete error:', error);
      return false;
    }
  }

  async clear(namespace?: string): Promise<void> {
    try {
      const pattern = namespace
        ? `${this.dbName}:${namespace}:*`
        : `${this.dbName}:*`;
      const keys = await this.client.keys(pattern);

      if (keys.length > 0) {
        // Use single del call with spread operator for better performance
        await this.client.del(...keys);
        this.stats.deletes += keys.length;
      }
    } catch (error) {
      logger.error('Redis clear error:', error);
      throw error;
    }
  }

  async has(key: string, namespace?: string): Promise<boolean> {
    try {
      const fullKey = this.getFullKey(key, namespace);
      const exists = await this.client.exists(fullKey);
      return exists > 0;
    } catch (error) {
      logger.error('Redis has error:', error);
      return false;
    }
  }

  async keys(namespace?: string): Promise<string[]> {
    try {
      const pattern = namespace
        ? `${this.dbName}:${namespace}:*`
        : `${this.dbName}:default:*`;
      const fullKeys = await this.client.keys(pattern);

      // Extract the actual key part (remove the prefix)
      const prefix = namespace
        ? `${this.dbName}:${namespace}:`
        : `${this.dbName}:default:`;
      return fullKeys.map((key) => key.substring(prefix.length));
    } catch (error) {
      logger.error('Redis keys error:', error);
      return [];
    }
  }

  async getStats(namespace?: string): Promise<CacheStats> {
    try {
      const pattern = namespace
        ? `${this.dbName}:${namespace}:*`
        : `${this.dbName}:*`;
      const keys = await this.client.keys(pattern);

      return {
        ...this.stats,
        size: keys.length,
      };
    } catch (error) {
      logger.error('Redis getStats error:', error);
      return { ...this.stats };
    }
  }

  async script(mode: 'LOAD' | 'EXISTS', script: string): Promise<unknown> {
    return await this.client.script('LOAD', script);
  }

  async evalsha(sha: string, keys: string[], args: string[]): Promise<unknown> {
    return await this.client.evalsha(sha, keys.length, ...keys, ...args);
  }

  async cleanup(): Promise<void> {
    // Redis handles TTL automatically, so this is mostly a no-op
    // We could scan for entries with manual expiration and clean them up
    logger.debug('Redis cleanup - TTL handled automatically by Redis');
  }

  async close(): Promise<void> {
    try {
      await this.client.quit();
      logger.debug('Redis cache backend closed');
    } catch (error) {
      logger.error('Error closing Redis connection:', error);
    }
  }
}

// Factory function to create Redis backend with ioredis
export function createRedisBackend(
  redisUrl: string,
  options?: any
): RedisCacheBackend {
  // Extract dbName from options or use 'cache' as default
  const dbName = options?.dbName || 'cache';

  // Create ioredis client with URL and any additional options
  // ioredis supports Redis URL format: redis://[username:password@]host[:port][/db]
  const client = new Redis(redisUrl, {
    ...options,
    // Remove dbName from options as it's not an ioredis option
    dbName: undefined,
  });

  return new RedisCacheBackend(client as RedisClient, dbName);
}
