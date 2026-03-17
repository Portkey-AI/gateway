/**
 * MCP Bundle Routes
 * Serves presigned MCP server bundles in MCP standard format
 */

import { Hono } from 'hono';
import { createLogger } from '../../shared/utils/logger.js';
import { getControlPlane } from '../middleware/controlPlane.js';

const logger = createLogger('mcp-bundle');

type Env = {
  Variables: {
    controlPlane?: any;
  };
};

const bundleRoutes = new Hono<Env>();

/**
 * MCP Standard format for server configuration
 * https://modelcontextprotocol.io/docs/tools/mcp-config
 */
interface MCPStandardConfig {
  mcpServers: {
    [serverName: string]: {
      url: string;
      transport?: 'sse' | 'http';
    };
  };
}

/**
 * GET /bundle/:bundleToken
 * Returns MCP server bundle in standard MCP format
 */
bundleRoutes.get('/:bundleToken', async (c) => {
  const { bundleToken } = c.req.param();

  if (!bundleToken) {
    return c.json({ error: 'Bundle token is required' }, 400);
  }

  logger.debug('Bundle request received', { bundleToken: bundleToken.slice(0, 8) + '...' });

  // Get bundle from control plane
  const controlPlane = getControlPlane();

  try {
    const bundle = await controlPlane.getMCPBundle(bundleToken);

    if (!bundle) {
      logger.warn('Bundle not found', { bundleToken: bundleToken.slice(0, 8) + '...' });
      return c.json({ error: 'Bundle not found' }, 404);
    }

    // Check if expired
    const expiresAt = new Date(bundle.expires_at);
    if (expiresAt < new Date()) {
      logger.warn('Bundle has expired', { bundleToken: bundleToken.slice(0, 8) + '...' });
      return c.json({ error: 'Bundle has expired' }, 410);
    }

    // Parse servers from bundle
    const servers = typeof bundle.servers === 'string'
      ? JSON.parse(bundle.servers)
      : bundle.servers;

    // Build MCP standard format response
    const mcpConfig: MCPStandardConfig = {
      mcpServers: {},
    };

    for (const [serverName, serverConfig] of Object.entries(servers)) {
      const config = serverConfig as { url: string; transport?: string; original_url?: string };
      mcpConfig.mcpServers[serverName] = {
        url: config.url,
        transport: (config.transport || 'sse') as 'sse' | 'http',
      };
    }

    logger.info('Bundle served successfully', {
      bundleToken: bundleToken.slice(0, 8) + '...',
      serverCount: Object.keys(mcpConfig.mcpServers).length,
    });

    return c.json(mcpConfig);
  } catch (error) {
    logger.error('Failed to retrieve bundle', {
      error: error instanceof Error ? error.message : 'Unknown error',
      bundleToken: bundleToken.slice(0, 8) + '...',
    });
    return c.json({ error: 'Failed to retrieve bundle' }, 500);
  }
});

/**
 * GET /bundle/:bundleToken/info
 * Returns bundle metadata (for debugging)
 */
bundleRoutes.get('/:bundleToken/info', async (c) => {
  const { bundleToken } = c.req.param();

  if (!bundleToken) {
    return c.json({ error: 'Bundle token is required' }, 400);
  }

  const controlPlane = getControlPlane();

  try {
    const bundle = await controlPlane.getMCPBundle(bundleToken);

    if (!bundle) {
      return c.json({ error: 'Bundle not found' }, 404);
    }

    const servers = typeof bundle.servers === 'string'
      ? JSON.parse(bundle.servers)
      : bundle.servers;

    return c.json({
      bundle_token: bundleToken,
      session_id: bundle.session_id,
      expires_at: bundle.expires_at,
      created_at: bundle.created_at,
      server_count: Object.keys(servers).length,
      server_names: Object.keys(servers),
      is_expired: new Date(bundle.expires_at) < new Date(),
    });
  } catch (error) {
    logger.error('Failed to retrieve bundle info', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return c.json({ error: 'Failed to retrieve bundle info' }, 500);
  }
});

export { bundleRoutes };
