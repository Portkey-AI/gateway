import { createMiddleware } from 'hono/factory';
import { ServerConfig } from '../../types/mcp';
import { createLogger } from '../../utils/logger';
import { CacheService, getConfigCache } from '../../services/cache';
import { ControlPlane } from '../controlPlane';
import { Context, Next } from 'hono';

const logger = createLogger('mcp/hydrateContext');

const TTL = 5 * 60 * 1000;

let LOCAL_CONFIGS_LOADED: boolean = false;

type Env = {
  Variables: {
    serverConfig: ServerConfig;
    session?: any;
    tokenInfo?: any;
    isAuthenticated?: boolean;
    controlPlane?: ControlPlane;
  };
  Bindings: {
    ALBUS_BASEPATH?: string;
  };
};

/**
 * Load and cache all local server configurations
 */
const loadLocalServerConfigs = async (
  configCache: CacheService
): Promise<boolean> => {
  if (LOCAL_CONFIGS_LOADED) return true;

  try {
    const serverConfigPath =
      process.env.SERVERS_CONFIG_PATH || './data/servers.json';

    const fs = await import('fs');
    const path = await import('path');

    const configPath = path.resolve(serverConfigPath);
    const configData = await fs.promises.readFile(configPath, 'utf-8');
    const config = JSON.parse(configData);

    const serverConfigs = config.servers || {};

    Object.keys(serverConfigs).forEach((id: string) => {
      const serverConfig = serverConfigs[id];
      configCache.set(id, {
        ...serverConfig,
        workspaceId: id.split('/')[0],
        serverId: id.split('/')[1],
      });
    });

    logger.info(`Loaded ${Object.keys(serverConfigs).length} server configs`);
    LOCAL_CONFIGS_LOADED = true;
    return true;
  } catch (error) {
    logger.warn('Failed to load local server configurations:', error);
    throw error;
  }
};

const getFromCP = async (
  cp: ControlPlane,
  workspaceId: string,
  serverId: string
) => {
  try {
    logger.debug(`Fetching server from control plane`);

    const serverInfo: any = await cp.getMCPServer(workspaceId, serverId);

    if (serverInfo) {
      return {
        serverId,
        workspaceId,
        url: serverInfo.mcp_integration_details?.url,
        headers:
          serverInfo.mcp_integration_details?.configurations?.headers ||
          serverInfo.default_headers ||
          {},
        auth_type: serverInfo.mcp_integration_details?.auth_type || 'headers',
        type:
          serverInfo.mcp_integration_details?.transport || 'streamable-http',
      } as ServerConfig;
    }
  } catch (error) {
    logger.warn(
      `Failed to fetch server ${workspaceId}/${serverId} from control plane`
    );
    return null;
  }
};

const success = (c: Context, serverInfo: ServerConfig, next: Next) => {
  c.set('serverConfig', serverInfo);
  return next();
};

const error = (c: Context, workspaceId: string, serverId: string) => {
  logger.error(
    `Server configuration not found for: ${workspaceId}/${serverId}`
  );
  return c.json(
    {
      error: 'not_found',
      error_description: `Server '${workspaceId}/${serverId}' not found`,
    },
    404
  );
};

/**
 * Get server configuration by ID, trying control plane first if available
 */
export const getServerConfig = async (
  workspaceId: string,
  serverId: string,
  c: any
): Promise<any> => {
  const configCache = getConfigCache();
  const cacheKey = `${workspaceId}/${serverId}`;

  const cached = await configCache.get(cacheKey);
  if (cached) return cached;

  const CP = c.get('controlPlane');
  if (CP) {
    const serverInfo = await getFromCP(CP, workspaceId, serverId);
    if (serverInfo) {
      await configCache.set(
        cacheKey,
        { ...serverInfo, workspaceId, serverId },
        { ttl: TTL }
      );
    }
    return serverInfo; // Return null if not found in CP - don't fallback
  } else {
    // Only use local configs when no Control Plane is available
    if (!LOCAL_CONFIGS_LOADED) {
      await loadLocalServerConfigs(configCache);
    }
    return await configCache.get(cacheKey);
  }
};

export const hydrateContext = createMiddleware<Env>(async (c, next) => {
  const serverId = c.req.param('serverId');
  const workspaceId = c.req.param('workspaceId');

  if (!serverId || !workspaceId) {
    return next();
  }

  // Check cache for server config
  const serverInfo = await getServerConfig(workspaceId, serverId, c);
  if (serverInfo) return success(c, serverInfo, next);

  return error(c, workspaceId, serverId);
});
