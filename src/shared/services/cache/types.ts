/**
 * @file src/services/cache/types.ts
 * Type definitions for the unified cache system
 */

export interface CacheEntry<T = any> {
  value: T;
  expiresAt?: number;
  createdAt: number;
  metadata?: Record<string, any>;
}

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  namespace?: string; // Cache namespace for organization
  metadata?: Record<string, any>; // Additional metadata
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  size: number;
  expired: number;
}

export interface CacheBackend {
  get<T = any>(key: string, namespace?: string): Promise<CacheEntry<T> | null>;
  set<T = any>(key: string, value: T, options?: CacheOptions): Promise<void>;
  delete(key: string, namespace?: string): Promise<boolean>;
  clear(namespace?: string): Promise<void>;
  has(key: string, namespace?: string): Promise<boolean>;
  keys(namespace?: string): Promise<string[]>;
  getStats(namespace?: string): Promise<CacheStats>;
  cleanup(): Promise<void>; // Remove expired entries
  close(): Promise<void>; // Cleanup resources
}

export interface CacheConfig {
  backend: 'memory' | 'file' | 'redis' | 'cloudflareKV';
  defaultTtl?: number; // Default TTL in milliseconds
  cleanupInterval?: number; // Cleanup interval in milliseconds
  // File backend options
  dataDir?: string;
  fileName?: string;
  saveInterval?: number; // Debounce save interval
  // Redis backend options
  redisUrl?: string;
  redisOptions?: any;
  // Memory backend options
  maxSize?: number; // Maximum number of entries
  // Cloudflare KV backend options
  env?: any;
  kvBindingName?: string;
  dbName?: string;
}
