/**
 * @file src/shared/services/cache/backends/valkey.ts
 * Valkey cache backend implementation using @valkey/valkey-glide.
 *
 * API differences from ioredis that this implementation handles:
 *  - Connection: await GlideClient.createClient(config) - async, no sync constructor
 *  - SET + TTL: .set(key, val, { expiry: { type: 'seconds', count: sec } })
 *  - DEL: .del([key]) - takes an array, not variadic
 *  - EXISTS: .exists([key]) - takes an array
 *  - KEYS: no .keys() method - use scan cursor loop instead
 *  - Disconnect: .close() not .quit()
 */
import {
  GlideClient,
  GlideClusterClient,
  ClusterScanCursor,
  GlideString,
  TimeUnit,
} from '@valkey/valkey-glide';
import { CacheBackend, CacheEntry, CacheOptions, CacheStats } from '../types';

const logger = {
  debug: (msg: string, ...args: any[]) =>
    console.debug(`[ValkeyCache] ${msg}`, ...args),
  info: (msg: string, ...args: any[]) =>
    console.info(`[ValkeyCache] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) =>
    console.warn(`[ValkeyCache] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) =>
    console.error(`[ValkeyCache] ${msg}`, ...args),
};

export class ValkeyCacheBackend implements CacheBackend {
  private client: GlideClient | GlideClusterClient;
  private dbName: string;

  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    size: 0,
    expired: 0,
  };

  constructor(client: GlideClient | GlideClusterClient, dbName: string) {
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

      if (data === null) {
        this.stats.misses++;
        return null;
      }

      const entry = this.deserializeEntry<T>(data as string);

      if (this.isExpired(entry)) {
        // TTL should handle this, but double-check
        await this.client.del([fullKey]);
        this.stats.expired++;
        this.stats.misses++;
        return null;
      }

      this.stats.hits++;
      return entry;
    } catch (error) {
      logger.error('Valkey get error:', error);
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
        const ttlSeconds = Math.ceil(options.ttl / 1000);
        // GLIDE uses structured expiry options, not "EX" string flag
        await this.client.set(fullKey, serialized, {
          expiry: { type: TimeUnit.Seconds, count: ttlSeconds },
        });
      } else {
        await this.client.set(fullKey, serialized);
      }

      this.stats.sets++;
    } catch (error) {
      logger.error('Valkey set error:', error);
      throw error;
    }
  }

  async delete(key: string, namespace?: string): Promise<boolean> {
    try {
      const fullKey = this.getFullKey(key, namespace);
      // GLIDE del takes an array
      const deleted = await this.client.del([fullKey]);
      if (deleted > 0) {
        this.stats.deletes++;
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Valkey delete error:', error);
      return false;
    }
  }

  async clear(namespace?: string): Promise<void> {
    try {
      const pattern = namespace
        ? `${this.dbName}:${namespace}:*`
        : `${this.dbName}:*`;
      const keys = await this.scanKeys(pattern);
      if (keys.length > 0) {
        // GLIDE del takes an array
        await this.client.del(keys);
        this.stats.deletes += keys.length;
      }
    } catch (error) {
      logger.error('Valkey clear error:', error);
      throw error;
    }
  }

  async has(key: string, namespace?: string): Promise<boolean> {
    try {
      const fullKey = this.getFullKey(key, namespace);
      // GLIDE exists takes an array
      const count = await this.client.exists([fullKey]);
      return (count as number) > 0;
    } catch (error) {
      logger.error('Valkey has error:', error);
      return false;
    }
  }

  async keys(namespace?: string): Promise<string[]> {
    try {
      const pattern = namespace
        ? `${this.dbName}:${namespace}:*`
        : `${this.dbName}:default:*`;
      const fullKeys = await this.scanKeys(pattern);
      const prefix = namespace
        ? `${this.dbName}:${namespace}:`
        : `${this.dbName}:default:`;
      return fullKeys.map((k) => k.substring(prefix.length));
    } catch (error) {
      logger.error('Valkey keys error:', error);
      return [];
    }
  }

  /**
   * Cluster client uses ClusterScanCursor; standalone uses string cursor.
   * Capped at MAX_SCAN_KEYS to prevent unbounded iteration on large keyspaces.
   */
  private async scanKeys(pattern: string): Promise<string[]> {
    const MAX_SCAN_KEYS = 10_000;
    const result: string[] = [];

    if (this.client instanceof GlideClusterClient) {
      let cursor = new ClusterScanCursor();
      while (!cursor.isFinished()) {
        const [nextCursor, keys] = await (
          this.client as GlideClusterClient
        ).scan(cursor, {
          match: pattern,
          count: 100,
        });
        cursor = nextCursor;
        result.push(...keys.map((k) => k.toString()));
        if (result.length >= MAX_SCAN_KEYS) {
          logger.warn(
            `scanKeys truncated at ${MAX_SCAN_KEYS} — pattern may match too broadly: ${pattern}`
          );
          break;
        }
      }
    } else {
      let cursor: GlideString = '0';
      do {
        const scanResult = await (this.client as GlideClient).scan(cursor, {
          match: pattern,
          count: 100,
        });
        cursor = scanResult[0];
        result.push(...scanResult[1].map((k) => k.toString()));
        if (result.length >= MAX_SCAN_KEYS) {
          logger.warn(
            `scanKeys truncated at ${MAX_SCAN_KEYS} — pattern may match too broadly: ${pattern}`
          );
          break;
        }
      } while (cursor.toString() !== '0');
    }

    return result;
  }

  async getStats(namespace?: string): Promise<CacheStats> {
    try {
      const pattern = namespace
        ? `${this.dbName}:${namespace}:*`
        : `${this.dbName}:*`;
      const keys = await this.scanKeys(pattern);
      return { ...this.stats, size: keys.length };
    } catch (error) {
      logger.error('Valkey getStats error:', error);
      return { ...this.stats };
    }
  }

  async cleanup(): Promise<void> {
    // Valkey TTL handles expiry automatically
    logger.debug('Valkey cleanup - TTL handled automatically by Valkey');
  }

  async close(): Promise<void> {
    try {
      this.client.close();
      logger.debug('Valkey cache backend closed');
    } catch (error) {
      logger.error('Error closing Valkey connection:', error);
    }
  }
}

/**
 * Factory function to create a ValkeyCacheBackend.
 * The caller must supply an already-connected GlideClient (GLIDE init is async).
 */
export function createValkeyBackend(
  client: GlideClient | GlideClusterClient,
  dbName: string = 'cache'
): ValkeyCacheBackend {
  return new ValkeyCacheBackend(client, dbName);
}
