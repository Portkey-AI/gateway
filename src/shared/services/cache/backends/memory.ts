/**
 * @file src/services/cache/backends/memory.ts
 * In-memory cache backend implementation
 */

import { CacheBackend, CacheEntry, CacheOptions, CacheStats } from '../types';
// Using console.log for now to avoid build issues
const logger = {
  debug: (msg: string, ...args: any[]) =>
    console.debug(`[MemoryCache] ${msg}`, ...args),
  info: (msg: string, ...args: any[]) =>
    console.info(`[MemoryCache] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) =>
    console.warn(`[MemoryCache] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) =>
    console.error(`[MemoryCache] ${msg}`, ...args),
};

export class MemoryCacheBackend implements CacheBackend {
  private cache = new Map<string, CacheEntry>();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    size: 0,
    expired: 0,
  };
  private cleanupInterval?: NodeJS.Timeout;
  private maxSize: number;

  constructor(maxSize: number = 10000, cleanupIntervalMs: number = 60000) {
    this.maxSize = maxSize;
    this.startCleanup(cleanupIntervalMs);
  }

  private startCleanup(intervalMs: number): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, intervalMs);
  }

  private getFullKey(key: string, namespace?: string): string {
    return namespace ? `${namespace}:${key}` : key;
  }

  private isExpired(entry: CacheEntry): boolean {
    return entry.expiresAt !== undefined && entry.expiresAt <= Date.now();
  }

  private evictIfNeeded(): void {
    if (this.cache.size >= this.maxSize) {
      // Simple LRU: remove oldest entries
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].createdAt - b[1].createdAt);

      const toRemove = Math.floor(this.maxSize * 0.1); // Remove 10%
      for (let i = 0; i < toRemove && i < entries.length; i++) {
        this.cache.delete(entries[i][0]);
      }

      logger.debug(`Evicted ${toRemove} entries due to size limit`);
    }
  }

  async get<T = any>(
    key: string,
    namespace?: string
  ): Promise<CacheEntry<T> | null> {
    const fullKey = this.getFullKey(key, namespace);
    const entry = this.cache.get(fullKey);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(fullKey);
      this.stats.expired++;
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry as CacheEntry<T>;
  }

  async set<T = any>(
    key: string,
    value: T,
    options: CacheOptions = {}
  ): Promise<void> {
    const fullKey = this.getFullKey(key, options.namespace);
    const now = Date.now();

    const entry: CacheEntry<T> = {
      value,
      createdAt: now,
      expiresAt: options.ttl ? now + options.ttl : undefined,
      metadata: options.metadata,
    };

    this.evictIfNeeded();
    this.cache.set(fullKey, entry);
    this.stats.sets++;
    this.stats.size = this.cache.size;
  }

  async delete(key: string, namespace?: string): Promise<boolean> {
    const fullKey = this.getFullKey(key, namespace);
    const deleted = this.cache.delete(fullKey);

    if (deleted) {
      this.stats.deletes++;
      this.stats.size = this.cache.size;
    }

    return deleted;
  }

  async clear(namespace?: string): Promise<void> {
    if (namespace) {
      const prefix = `${namespace}:`;
      const keysToDelete = Array.from(this.cache.keys()).filter((key) =>
        key.startsWith(prefix)
      );

      for (const key of keysToDelete) {
        this.cache.delete(key);
      }

      this.stats.deletes += keysToDelete.length;
    } else {
      this.stats.deletes += this.cache.size;
      this.cache.clear();
    }

    this.stats.size = this.cache.size;
  }

  async has(key: string, namespace?: string): Promise<boolean> {
    const fullKey = this.getFullKey(key, namespace);
    const entry = this.cache.get(fullKey);

    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.cache.delete(fullKey);
      this.stats.expired++;
      return false;
    }

    return true;
  }

  async keys(namespace?: string): Promise<string[]> {
    const allKeys = Array.from(this.cache.keys());

    if (namespace) {
      const prefix = `${namespace}:`;
      return allKeys
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.substring(prefix.length));
    }

    return allKeys;
  }

  async getStats(namespace?: string): Promise<CacheStats> {
    if (namespace) {
      const prefix = `${namespace}:`;
      const namespaceKeys = Array.from(this.cache.keys()).filter((key) =>
        key.startsWith(prefix)
      );

      let expired = 0;
      for (const key of namespaceKeys) {
        const entry = this.cache.get(key);
        if (entry && this.isExpired(entry)) {
          expired++;
        }
      }

      return {
        ...this.stats,
        size: namespaceKeys.length,
        expired,
      };
    }

    return { ...this.stats };
  }

  async cleanup(): Promise<void> {
    let expiredCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      this.stats.expired += expiredCount;
      this.stats.size = this.cache.size;
      logger.debug(`Cleaned up ${expiredCount} expired entries`);
    }
  }

  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.cache.clear();
    logger.debug('Memory cache backend closed');
  }
}
