/**
 * MCP Gateway Cache
 * Wraps the shared cache service for MCP-specific operations
 */

import { getMcpServersCache, getSessionCache } from '../../shared/services/cache/index.js';
import { CACHE_NAMESPACES, TIMEOUTS } from '../constants/index.js';
import type { CacheService } from '../../shared/services/cache/index.js';

// Cache wrapper with MCP-specific methods
class MCPCacheService {
  private getMcpCache(): CacheService {
    return getMcpServersCache();
  }

  private getSessionCacheInstance(): CacheService {
    return getSessionCache();
  }

  // Session cache operations
  async getSession<T>(sessionId: string): Promise<T | null> {
    return this.getSessionCacheInstance().get<T>(sessionId, CACHE_NAMESPACES.SESSIONS);
  }

  async setSession<T>(sessionId: string, data: T, ttl?: number): Promise<void> {
    await this.getSessionCacheInstance().set(sessionId, data, {
      namespace: CACHE_NAMESPACES.SESSIONS,
      ttl: ttl ?? TIMEOUTS.SESSION_TTL,
    });
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    return this.getSessionCacheInstance().delete(sessionId, CACHE_NAMESPACES.SESSIONS);
  }

  // Server config cache operations
  async getServerConfig<T>(serverId: string): Promise<T | null> {
    return this.getMcpCache().get<T>(serverId, CACHE_NAMESPACES.SERVERS);
  }

  async setServerConfig<T>(serverId: string, config: T, ttl?: number): Promise<void> {
    await this.getMcpCache().set(serverId, config, {
      namespace: CACHE_NAMESPACES.SERVERS,
      ttl: ttl ?? TIMEOUTS.SERVER_CONFIG_TTL,
    });
  }

  // Token cache operations
  async getTokens<T>(serverId: string): Promise<T | null> {
    return this.getMcpCache().get<T>(serverId, CACHE_NAMESPACES.TOKENS);
  }

  async setTokens<T>(serverId: string, tokens: T, ttl?: number): Promise<void> {
    await this.getMcpCache().set(serverId, tokens, {
      namespace: CACHE_NAMESPACES.TOKENS,
      ttl: ttl ?? TIMEOUTS.SESSION_TTL,
    });
  }

  async deleteTokens(serverId: string): Promise<boolean> {
    return this.getMcpCache().delete(serverId, CACHE_NAMESPACES.TOKENS);
  }

  // Toolkit config cache operations
  async getToolkitConfig<T>(toolkitId: string): Promise<T | null> {
    return this.getMcpCache().get<T>(toolkitId, CACHE_NAMESPACES.TOOLKITS);
  }

  async setToolkitConfig<T>(toolkitId: string, config: T, ttl?: number): Promise<void> {
    await this.getMcpCache().set(toolkitId, config, {
      namespace: CACHE_NAMESPACES.TOOLKITS,
      ttl: ttl ?? TIMEOUTS.TOOLKIT_CONFIG_TTL,
    });
  }

  // OAuth state operations
  async getOAuthState<T>(state: string): Promise<T | null> {
    return this.getMcpCache().get<T>(state, CACHE_NAMESPACES.OAUTH_STATE);
  }

  async setOAuthState<T>(state: string, data: T, ttl?: number): Promise<void> {
    await this.getMcpCache().set(state, data, {
      namespace: CACHE_NAMESPACES.OAUTH_STATE,
      ttl: ttl ?? TIMEOUTS.OAUTH_STATE_TTL,
    });
  }

  async deleteOAuthState(state: string): Promise<boolean> {
    return this.getMcpCache().delete(state, CACHE_NAMESPACES.OAUTH_STATE);
  }

  // Generic operations
  async get<T>(key: string, namespace?: string): Promise<T | null> {
    return this.getMcpCache().get<T>(key, namespace);
  }

  async set<T>(key: string, value: T, options?: { ttl?: number; namespace?: string }): Promise<void> {
    await this.getMcpCache().set(key, value, options);
  }

  async delete(key: string, namespace?: string): Promise<boolean> {
    return this.getMcpCache().delete(key, namespace);
  }

  async has(key: string, namespace?: string): Promise<boolean> {
    return this.getMcpCache().has(key, namespace);
  }

  async clear(namespace?: string): Promise<void> {
    await this.getMcpCache().clear(namespace);
  }

  // No-op for compatibility - cleanup is handled by shared cache
  close(): void {
    // Shared cache handles cleanup
  }
}

// Singleton instance
let cacheInstance: MCPCacheService | null = null;

export function getCache(): MCPCacheService {
  if (!cacheInstance) {
    cacheInstance = new MCPCacheService();
  }
  return cacheInstance;
}

export function closeCache(): void {
  // No-op - shared cache handles cleanup
  cacheInstance = null;
}

export { MCPCacheService as CacheService };
