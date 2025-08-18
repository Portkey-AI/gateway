import { createMiddleware } from 'hono/factory';
import { ServerConfig } from '../../types/mcp';
import { createLogger } from '../../utils/logger';

const logger = createLogger('mcp/hydateContext');

// Load server configurations
let serverConfigs: any = {};

// Load configurations asynchronously at startup
const loadServerConfigs = async () => {
  try {
    const serverConfigPath =
      process.env.SERVERS_CONFIG_PATH || './data/servers.json';
    const fs = await import('fs');
    const path = await import('path');

    const configPath = path.resolve(serverConfigPath);
    const configData = await fs.promises.readFile(configPath, 'utf-8');
    const config = JSON.parse(configData);
    serverConfigs = config.servers || {};

    logger.info(
      `Loaded ${Object.keys(serverConfigs).length} server configurations`
    );
  } catch (error) {
    logger.warn(
      'Failed to load server configurations. You can create local server configs at ./data/servers.json',
      error
    );
  }
};

// Load configs immediately
await loadServerConfigs();

type Env = {
  Variables: {
    serverConfig: ServerConfig;
    session?: any;
    tokenInfo?: any;
    isAuthenticated?: boolean;
  };
  Bindings: {
    ALBUS_BASEPATH?: string;
  };
};

export const hydrateContext = createMiddleware<Env>(async (c, next) => {
  const serverId = c.req.param('serverId');

  if (!serverId) {
    return next();
  }

  // Check if we have token-based configuration
  const tokenInfo = (c as any).var?.tokenInfo;

  if (tokenInfo?.mcp_permissions?.servers?.[serverId]) {
    // Use server config from token
    const serverPerms = tokenInfo.mcp_permissions.servers[serverId];
    logger.debug(`Using token-based config for server: ${serverId}`);

    // Get server configuration
    const serverInfo = serverConfigs[serverId];
    if (!serverInfo) {
      logger.error(`Server configuration not found for: ${serverId}`);
      return c.json(
        {
          error: 'not_found',
          error_description: `Server '${serverId}' not found`,
        },
        404
      );
    }

    const config: ServerConfig = {
      serverId,
      url: serverInfo.url,
      headers: serverInfo.default_headers || {},
      tools: {
        allowed: serverPerms.allowed_tools,
        blocked: serverPerms.blocked_tools,
        rateLimit: serverPerms.rate_limit,
        logCalls: true,
      },
    };

    c.set('serverConfig', config);
  } else if (!(c as any).var?.isAuthenticated) {
    // Use server configuration with default permissions during migration
    logger.debug(`Using default config for server: ${serverId} (no auth)`);

    const serverInfo = serverConfigs[serverId];
    if (!serverInfo) {
      logger.error(`Server configuration not found for: ${serverId}`);
      return c.json(
        {
          error: 'not_found',
          error_description: `Server '${serverId}' not found`,
          available_servers: Object.keys(serverConfigs),
        },
        404
      );
    }

    // For unauthenticated access, use hardcoded credentials if needed
    const headers = { ...serverInfo.default_headers };

    const config: ServerConfig = {
      serverId,
      url: serverInfo.url,
      headers,
      tools: serverInfo.default_permissions,
    };

    c.set('serverConfig', config);
  } else {
    // Authenticated but no permission for this server
    logger.warn(`Authenticated user has no permission for server: ${serverId}`);
    return c.json(
      {
        error: 'forbidden',
        error_description: `You don't have permission to access server: ${serverId}`,
        available_servers: Object.keys(
          tokenInfo?.mcp_permissions?.servers || {}
        ),
      },
      403,
      {
        'WWW-Authenticate': `Bearer realm="${new URL(c.req.url).origin}", error="insufficient_scope"`,
      }
    );
  }

  await next();
});
