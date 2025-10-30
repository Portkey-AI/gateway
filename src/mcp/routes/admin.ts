/**
 * @file src/routes/admin.ts
 * Admin routes for managing MCP servers and cache
 */

import { Hono } from 'hono';
import { createLogger } from '../../shared/utils/logger';
import {
  getConfigCache,
  getSessionCache,
  getMcpServersCache,
  getDefaultCache,
  getTokenCache,
  getOauthStore,
} from '../../shared/services/cache';
import { ServerConfig } from '../types/mcp';

const logger = createLogger('AdminRoutes');

type Env = {
  Variables: {
    controlPlane?: any;
  };
};

const adminRoutes = new Hono<Env>();

// MCP Server Management Routes

/**
 * Get all MCP servers
 */
adminRoutes.get('/mcp/servers', async (c) => {
  try {
    const configCache = getConfigCache();
    const allKeys = await configCache.keys();
    const servers: any[] = [];

    for (const key of allKeys) {
      const config = await configCache.get(key);
      if (config) {
        servers.push({
          id: key,
          ...config,
          cached: true,
        });
      }
    }

    return c.json({ servers });
  } catch (error) {
    logger.error('Failed to get MCP servers:', error);
    return c.json({ error: 'Failed to get MCP servers' }, 500);
  }
});

/**
 * Get specific MCP server
 */
adminRoutes.get('/mcp/servers/:id', async (c) => {
  try {
    const serverId = c.req.param('id');
    const configCache = getConfigCache();
    const config = await configCache.get(serverId);

    if (!config) {
      return c.json({ error: 'Server not found' }, 404);
    }

    return c.json({ server: config });
  } catch (error) {
    logger.error('Failed to get MCP server:', error);
    return c.json({ error: 'Failed to get MCP server' }, 500);
  }
});

/**
 * Create or update MCP server
 */
adminRoutes.post('/mcp/servers', async (c) => {
  try {
    const serverConfig: ServerConfig = await c.req.json();
    const serverId = `${serverConfig.workspaceId}/${serverConfig.serverId}`;

    const configCache = getConfigCache();
    await configCache.set(serverId, serverConfig);

    return c.json({
      message: 'Server saved successfully',
      server: { id: serverId, ...serverConfig },
    });
  } catch (error) {
    logger.error('Failed to save MCP server:', error);
    return c.json({ error: 'Failed to save MCP server' }, 500);
  }
});

/**
 * Delete MCP server
 */
adminRoutes.delete('/mcp/servers/:id', async (c) => {
  try {
    const serverId = c.req.param('id');
    const configCache = getConfigCache();

    // Remove from cache
    await configCache.delete(serverId);

    return c.json({ message: 'Server deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete MCP server:', error);
    return c.json({ error: 'Failed to delete MCP server' }, 500);
  }
});

// Cache Management Routes

/**
 * Get cache statistics with optional namespace filtering
 */
adminRoutes.get('/cache/stats', async (c) => {
  try {
    const namespaceFilter = c.req.query('namespace'); // Optional namespace filter
    const backendFilter = c.req.query('backend'); // Optional backend filter

    const caches = {
      config: getConfigCache(),
      session: getSessionCache(),
      mcpServers: getMcpServersCache(),
      default: getDefaultCache(),
      token: getTokenCache(),
      oauth: getOauthStore(),
    };

    const stats: any = {};

    for (const [name, cache] of Object.entries(caches)) {
      // Skip if backend filter is specified and doesn't match
      if (backendFilter && name !== backendFilter) {
        continue;
      }

      try {
        let cacheStats;
        let keys;

        if (namespaceFilter) {
          // Get stats for specific namespace
          cacheStats = await cache.getStats(namespaceFilter);
          keys = await cache.keys(namespaceFilter);

          stats[name] = {
            ...cacheStats,
            keyCount: keys.length,
            namespace: namespaceFilter,
            keys: keys.slice(0, 10), // Show first 10 keys as preview
          };
        } else {
          // Get all stats with namespace breakdown
          cacheStats = await cache.getStats();
          const allKeys = await cache.keys();

          // Get namespace breakdown
          const namespaceBreakdown: any = {};
          const namespacedKeys = allKeys.filter((k) => k.includes(':'));
          const nonNamespacedKeys = allKeys.filter((k) => !k.includes(':'));

          // Group namespaced keys
          namespacedKeys.forEach((key) => {
            const namespace = key.split(':')[0];
            if (!namespaceBreakdown[namespace]) {
              namespaceBreakdown[namespace] = 0;
            }
            namespaceBreakdown[namespace]++;
          });

          stats[name] = {
            ...cacheStats,
            keyCount: allKeys.length,
            nonNamespacedKeyCount: nonNamespacedKeys.length,
            namespaceBreakdown,
            keys: allKeys.slice(0, 10), // Show first 10 keys as preview
          };
        }
      } catch (error: any) {
        stats[name] = { error: error.message };
      }
    }

    return c.json({ cacheStats: stats });
  } catch (error: any) {
    logger.error('Failed to get cache stats:', error);
    return c.json({ error: 'Failed to get cache stats' }, 500);
  }
});

/**
 * Get cache statistics for a specific backend/namespace combination
 */
adminRoutes.get('/cache/:type/stats', async (c) => {
  try {
    const cacheType = c.req.param('type');
    const namespace = c.req.query('namespace'); // Optional namespace filter

    let cache;
    switch (cacheType) {
      case 'config':
        cache = getConfigCache();
        break;
      case 'session':
        cache = getSessionCache();
        break;
      case 'mcpServers':
        cache = getMcpServersCache();
        break;
      case 'default':
        cache = getDefaultCache();
        break;
      case 'token':
        cache = getTokenCache();
        break;
      case 'oauth':
        cache = getOauthStore();
        break;
      default:
        return c.json({ error: 'Invalid cache type' }, 400);
    }

    const cacheStats = await cache.getStats(namespace);
    const keys = await cache.keys(namespace);

    return c.json({
      stats: {
        ...cacheStats,
        keyCount: keys.length,
        namespace: namespace || null,
        backend: cacheType,
      },
    });
  } catch (error: any) {
    logger.error('Failed to get cache stats:', error);
    return c.json({ error: 'Failed to get cache stats' }, 500);
  }
});

/**
 * Get cache entries by cache type
 */
adminRoutes.get('/cache/:type', async (c) => {
  try {
    const cacheType = c.req.param('type');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');
    const namespaceFilter = c.req.query('namespace'); // Optional namespace filter

    let cache;
    switch (cacheType) {
      case 'config':
        cache = getConfigCache();
        break;
      case 'session':
        cache = getSessionCache();
        break;
      case 'mcpServers':
        cache = getMcpServersCache();
        break;
      case 'default':
        cache = getDefaultCache();
        break;
      case 'token':
        cache = getTokenCache();
        break;
      case 'oauth':
        cache = getOauthStore();
        break;
      default:
        return c.json({ error: 'Invalid cache type' }, 400);
    }

    const keys = await cache.keys(namespaceFilter);

    const paginatedKeys = keys.slice(offset, offset + limit);
    const entries = [];

    for (const key of paginatedKeys) {
      try {
        let value = await cache.get(key, namespaceFilter);

        entries.push({
          key,
          value,
        });
      } catch (error: any) {
        logger.warn(`Failed to get cache entry for key ${key}:`, error);
        entries.push({
          key,
          value: null,
          metadata: null,
          createdAt: null,
          expiresAt: null,
          error: error.message,
        });
      }
    }

    // Extract available namespaces from the keys
    const availableNamespaces = [
      ...new Set(
        keys.filter((k) => k.includes(':')).map((k) => k.split(':')[0])
      ),
    ];

    return c.json({
      entries,
      total: keys.length,
      offset,
      limit,
      availableNamespaces,
    });
  } catch (error) {
    logger.error('Failed to get cache entries:', error);
    return c.json({ error: 'Failed to get cache entries' }, 500);
  }
});

/**
 * Delete cache entry
 */
adminRoutes.delete('/cache/:type/:key', async (c) => {
  try {
    const cacheType = c.req.param('type');
    const key = decodeURIComponent(c.req.param('key'));

    let cache;
    switch (cacheType) {
      case 'config':
        cache = getConfigCache();
        break;
      case 'session':
        cache = getSessionCache();
        break;
      case 'mcpServers':
        cache = getMcpServersCache();
        break;
      case 'default':
        cache = getDefaultCache();
        break;
      case 'token':
        cache = getTokenCache();
        break;
      case 'oauth':
        cache = getOauthStore();
        break;
      default:
        return c.json({ error: 'Invalid cache type' }, 400);
    }

    // Check if key is namespaced (contains colon)
    if (key.includes(':')) {
      const [keyNamespace, actualKey] = key.split(':', 2);
      await cache.delete(actualKey, keyNamespace);
    } else {
      // Non-namespaced key
      await cache.delete(key);
    }

    return c.json({ message: 'Cache entry deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete cache entry:', error);
    return c.json({ error: 'Failed to delete cache entry' }, 500);
  }
});

/**
 * Clear entire cache
 */
adminRoutes.delete('/cache/:type', async (c) => {
  try {
    const cacheType = c.req.param('type');

    let cache;
    switch (cacheType) {
      case 'config':
        cache = getConfigCache();
        break;
      case 'session':
        cache = getSessionCache();
        break;
      case 'mcpServers':
        cache = getMcpServersCache();
        break;
      case 'default':
        cache = getDefaultCache();
        break;
      case 'token':
        cache = getTokenCache();
        break;
      case 'oauth':
        cache = getOauthStore();
        break;
      default:
        return c.json({ error: 'Invalid cache type' }, 400);
    }

    const namespace = c.req.query('namespace'); // Optional namespace to clear

    if (namespace) {
      // Clear specific namespace
      await cache.clear(namespace);
      return c.json({
        message: `${cacheType} cache namespace '${namespace}' cleared successfully`,
      });
    } else {
      // Clear entire cache
      await cache.clear();
      return c.json({ message: `${cacheType} cache cleared successfully` });
    }
  } catch (error: any) {
    logger.error('Failed to clear cache:', error);
    return c.json({ error: 'Failed to clear cache' }, 500);
  }
});

export { adminRoutes };
