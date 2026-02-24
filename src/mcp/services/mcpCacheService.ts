/**
 * @file src/mcp/services/mcpCacheService.ts
 * MCP Cache Service - Adapter for CacheProviderHandler to provide CacheService-like interface
 * This provides compatibility with the shared cache service patterns used in MCP
 */

import { CacheProviderHandler } from '../../services/cache/cacheProviderHandler';
import { requestCache } from '../../services/cache/cacheService';
import { CacheOptions } from '../../services/cache/types';

/**
 * MCP-specific cache service that provides a namespace-aware interface
 * compatible with the patterns used throughout the MCP codebase
 */
export class McpCacheService {
  private handler: CacheProviderHandler;
  private defaultNamespace?: string;

  constructor(handler: CacheProviderHandler, defaultNamespace?: string) {
    this.handler = handler;
    this.defaultNamespace = defaultNamespace;
  }

  /**
   * Get a value from the cache
   */
  async get<T = any>(key: string, namespace?: string): Promise<T | null> {
    const ns = namespace ?? this.defaultNamespace;
    return this.handler.get<T>(key, ns ? { namespace: ns } : undefined);
  }

  /**
   * Set a value in the cache
   */
  async set<T = any>(
    key: string,
    value: T,
    options: CacheOptions = {}
  ): Promise<void> {
    const opts: CacheOptions = {
      ...options,
      namespace: options.namespace ?? this.defaultNamespace,
    };
    await this.handler.set(key, value, opts);
  }

  /**
   * Delete a value from the cache
   */
  async delete(key: string, namespace?: string): Promise<boolean> {
    const ns = namespace ?? this.defaultNamespace;
    return this.handler.delete(key, ns);
  }

  /**
   * Check if a key exists
   */
  async has(key: string, namespace?: string): Promise<boolean> {
    const ns = namespace ?? this.defaultNamespace;
    return this.handler.exists(key, ns);
  }

  /**
   * Get all keys (limited implementation - scans with pattern matching)
   * Note: This is a simplified implementation that may not work perfectly
   * for all cache backends. For production use, consider implementing
   * proper key scanning in the cache provider.
   */
  async keys(_namespace?: string): Promise<string[]> {
    // This is a limitation - CacheProviderHandler doesn't expose key enumeration
    // For admin routes, this will return an empty array
    // The actual functionality would need to be implemented in the provider
    return [];
  }

  /**
   * Get cache statistics (stub implementation)
   */
  async getStats(_namespace?: string): Promise<{
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
    size: number;
    expired: number;
  }> {
    // Stats are not tracked in CacheProviderHandler
    // Return zeros for compatibility
    return {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      size: 0,
      expired: 0,
    };
  }

  /**
   * Clear cache (stub implementation)
   */
  async clear(_namespace?: string): Promise<void> {
    // Clear is not directly supported by CacheProviderHandler
    // Would need provider-level implementation
  }
}

// Global cache instances for different MCP use cases
let configCache: McpCacheService | null = null;
let sessionCache: McpCacheService | null = null;
let mcpServersCache: McpCacheService | null = null;
let defaultCache: McpCacheService | null = null;
let tokenCache: McpCacheService | null = null;
let oauthStore: McpCacheService | null = null;

/**
 * Initialize all MCP cache instances
 * Call this once during application startup
 */
export function initializeMcpCaches(cfEnv?: Record<string, any>): void {
  const handler = requestCache(cfEnv);

  configCache = new McpCacheService(handler, 'mcp:config');
  sessionCache = new McpCacheService(handler, 'mcp:session');
  mcpServersCache = new McpCacheService(handler, 'mcp:servers');
  defaultCache = new McpCacheService(handler, 'mcp:default');
  tokenCache = new McpCacheService(handler, 'mcp:token');
  oauthStore = new McpCacheService(handler, 'mcp:oauth');
}

/**
 * Get the config cache instance
 */
export function getConfigCache(): McpCacheService {
  if (!configCache) {
    // Auto-initialize if not yet initialized
    initializeMcpCaches();
  }
  return configCache!;
}

/**
 * Get the session cache instance
 */
export function getSessionCache(): McpCacheService {
  if (!sessionCache) {
    initializeMcpCaches();
  }
  return sessionCache!;
}

/**
 * Get the MCP servers cache instance
 */
export function getMcpServersCache(): McpCacheService {
  if (!mcpServersCache) {
    initializeMcpCaches();
  }
  return mcpServersCache!;
}

/**
 * Get the default cache instance
 */
export function getDefaultCache(): McpCacheService {
  if (!defaultCache) {
    initializeMcpCaches();
  }
  return defaultCache!;
}

/**
 * Get the token cache instance
 */
export function getTokenCache(): McpCacheService {
  if (!tokenCache) {
    initializeMcpCaches();
  }
  return tokenCache!;
}

/**
 * Get the OAuth store cache instance
 */
export function getOauthStore(): McpCacheService {
  if (!oauthStore) {
    initializeMcpCaches();
  }
  return oauthStore!;
}

// Type alias for compatibility
export type CacheService = McpCacheService;
