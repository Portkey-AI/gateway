/**
 * @file src/services/cache/backends/cloudflareKV.ts
 * Cloudflare KV cache backend implementation
 */

import { CacheBackend, CacheEntry, CacheOptions, CacheStats } from '../types';

// Using console.log for now to avoid build issues
const logger = {
  debug: (msg: string, ...args: any[]) =>
    console.debug(`[CloudflareKVCache] ${msg}`, ...args),
  info: (msg: string, ...args: any[]) =>
    console.info(`[CloudflareKVCache] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) =>
    console.warn(`[CloudflareKVCache] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) =>
    console.error(`[CloudflareKVCache] ${msg}`, ...args),
};

// Cloudflare KV client interface
interface ICloudflareKVClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: CacheOptions): Promise<void>;
  del(key: string): Promise<number>;
  keys(prefix: string): Promise<string[]>;
}

export class CloudflareKVCacheBackend implements CacheBackend {
  private client: ICloudflareKVClient;
  private dbName: string;

  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    size: 0,
    expired: 0,
  };

  constructor(client: ICloudflareKVClient, dbName: string) {
    this.client = client;
    this.dbName = dbName;
  }

  private getFullKey(key: string, namespace?: string): string {
    return namespace
      ? `${this.dbName}:${namespace}:${key}`
      : `${this.dbName}:default:${key}`;
  }

  private serializeEntry<T>(entry: CacheEntry<T>): string {
    return JSON.stringify(entry);
  }

  private deserializeEntry<T>(data: string): CacheEntry<T> {
    return JSON.parse(data);
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

      this.stats.hits++;
      return entry;
    } catch (error) {
      logger.error('Cloudflare KV get error:', error);
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

      this.client.set(fullKey, serialized, options);

      this.stats.sets++;
    } catch (error) {
      logger.error('Cloudflare KV set error:', error);
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
      logger.error('Cloudflare KV delete error:', error);
      return false;
    }
  }

  async clear(namespace?: string): Promise<void> {
    logger.debug('Cloudflare KV clear not implemented', namespace);
  }

  async keys(namespace?: string): Promise<string[]> {
    try {
      const prefix = namespace ? `cache:${namespace}:` : 'cache:default:';
      const fullKeys = await this.client.keys(prefix);

      return fullKeys.map((key) => key.substring(prefix.length));
    } catch (error) {
      logger.error('Cloudflare KV keys error:', error);
      return [];
    }
  }

  async getStats(namespace?: string): Promise<CacheStats> {
    try {
      const prefix = namespace ? `cache:${namespace}:` : 'cache:default:';
      const keys = await this.client.keys(prefix);

      return {
        ...this.stats,
        size: keys.length,
      };
    } catch (error) {
      logger.error('Cloudflare KV getStats error:', error);
      return { ...this.stats };
    }
  }

  async has(key: string, namespace?: string): Promise<boolean> {
    logger.info('Cloudflare KV has not implemented', key, namespace);
    return false;
  }

  async cleanup(): Promise<void> {
    // Cloudflare KV handles TTL automatically, so this is mostly a no-op
    // We could scan for entries with manual expiration and clean them up
    logger.debug(
      'Cloudflare KV cleanup - TTL handled automatically by Cloudflare KV'
    );
  }

  async close(): Promise<void> {
    logger.debug('Cloudflare KV close not implemented');
  }
}

// Cloudflare KV client implementation
class CloudflareKVClient implements ICloudflareKVClient {
  private KV: any;

  constructor(env: any, kvBindingName: string) {
    this.KV = env[kvBindingName];
  }

  get = async (key: string): Promise<string | null> => {
    return await this.KV.get(key);
  };

  set = async (
    key: string,
    value: string,
    options?: CacheOptions
  ): Promise<void> => {
    const kvOptions = {
      expirationTtl: options?.ttl,
      metadata: options?.metadata,
    };
    try {
      await this.KV.put(key, value, kvOptions);
      return;
    } catch (error) {
      logger.error('Error setting key in Cloudflare KV:', error);
      throw error;
    }
  };

  del = async (key: string): Promise<number> => {
    try {
      await this.KV.delete(key);
      return 1;
    } catch (error) {
      logger.error('Error deleting key in Cloudflare KV:', error);
      throw error;
    }
  };

  keys = async (prefix: string): Promise<string[]> => {
    return await this.KV.list({ prefix });
  };
}

// Factory function to create Cloudflare KV backend
export function createCloudflareKVBackend(
  env: any,
  bindingName: string,
  dbName: string
): CloudflareKVCacheBackend {
  const client = new CloudflareKVClient(env, bindingName);
  return new CloudflareKVCacheBackend(client, dbName);
}
