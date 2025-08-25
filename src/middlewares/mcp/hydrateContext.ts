import { createMiddleware } from 'hono/factory';
import { ServerConfig } from '../../types/mcp';
import { createLogger } from '../../utils/logger';
import { getConfigCache } from '../../services/cache';

const logger = createLogger('mcp/hydateContext');

const configCache = getConfigCache();
const userAgent = 'Portkey-MCP-Gateway/0.1.0';

const LOCAL_CONFIGS_CACHE_KEY = 'local_server_configs';
const SERVER_CONFIG_NAMESPACE = 'server_configs';

/**
 * Check if control plane is available
 */
const isUsingControlPlane = (): boolean => {
  return !!process.env.ALBUS_BASEPATH;
};

/**
 * Fetch a single server configuration from control plane
 */
async function getServerFromControlPlane(
  serverId: string,
  controlPlaneUrl: string | undefined
): Promise<any> {
  if (!controlPlaneUrl) {
    throw new Error('Control plane URL not available');
  }

  try {
    const response = await fetch(
      `${controlPlaneUrl}/v2/mcp-servers/${serverId}`,
      {
        method: 'GET',
        headers: {
          'User-Agent': userAgent,
          'Content-Type': 'application/json',
          'x-client-id-gateway': '',
          'x-portkey-api-key': '',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null; // Server not found
      }
      throw new Error(
        `Control plane responded with ${response.status}: ${response.statusText}`
      );
    }

    const data = (await response.json()) as any;
    return data;
  } catch (error) {
    logger.warn(
      `Failed to fetch server ${serverId} from control plane:`,
      error
    );
    throw error;
  }
}

/**
 * Load and cache all local server configurations
 */
const loadLocalServerConfigs = async (): Promise<Record<string, any>> => {
  // Check cache first
  const cached = await configCache.get<Record<string, any>>(
    LOCAL_CONFIGS_CACHE_KEY
  );
  if (cached) {
    logger.debug('Using cached local server configurations');
    return cached;
  }

  try {
    const serverConfigPath =
      process.env.SERVERS_CONFIG_PATH || './data/servers.json';
    const fs = await import('fs');
    const path = await import('path');

    const configPath = path.resolve(serverConfigPath);
    const configData = await fs.promises.readFile(configPath, 'utf-8');
    const config = JSON.parse(configData);

    const serverConfigs = config.servers || {};

    // Cache for 10 minutes
    await configCache.set(LOCAL_CONFIGS_CACHE_KEY, serverConfigs, {
      ttl: 10 * 60 * 1000,
    });

    logger.info(
      `Loaded and cached ${Object.keys(serverConfigs).length} server configurations from local file`
    );

    return serverConfigs;
  } catch (error) {
    logger.warn('Failed to load local server configurations:', error);
    throw error;
  }
};

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

/**
 * Get server configuration by ID, trying control plane first if available
 */
const getServerConfig = async (
  serverId: string,
  controlPlaneUrl: string | undefined
): Promise<any> => {
  // If using control plane, fetch the specific server
  if (isUsingControlPlane()) {
    // Check cache first for control plane configs
    const cacheKey = `cp_${serverId}`;
    const cached = await configCache.get(cacheKey, SERVER_CONFIG_NAMESPACE);
    if (cached) {
      logger.debug(`Using cached control plane config for server: ${serverId}`);
      return cached;
    }

    try {
      logger.debug(`Fetching server ${serverId} from control plane`);
      const serverInfo = await getServerFromControlPlane(
        serverId,
        controlPlaneUrl
      );
      if (serverInfo) {
        // Cache for 5 minutes (shorter TTL for control plane configs for security)
        await configCache.set(cacheKey, serverInfo, {
          namespace: SERVER_CONFIG_NAMESPACE,
          ttl: 5 * 60 * 1000,
        });
        return serverInfo;
      }
    } catch (error) {
      logger.warn(
        `Failed to fetch server ${serverId} from control plane, trying local configs`
      );
    }
  }

  // For local configs, load entire file and cache it, then return the specific server
  try {
    const localConfigs = await loadLocalServerConfigs();
    return localConfigs[serverId] || null;
  } catch (error) {
    logger.warn('Failed to load local server configurations:', error);
    return null;
  }
};

export const hydrateContext = createMiddleware<Env>(async (c, next) => {
  const serverId = c.req.param('serverId');
  const controlPlaneUrl = c.env.ALBUS_BASEPATH;

  if (!serverId) {
    return next();
  }

  // Get server configuration (control plane will handle authorization, local assumes single user)
  const serverInfo = await getServerConfig(serverId, controlPlaneUrl);
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

  logger.debug(`Using server config for: ${serverId}`);

  const config: ServerConfig = {
    serverId,
    url: serverInfo.url,
    headers: serverInfo.default_headers || {},
    auth_type: serverInfo.auth_type || 'headers', // Default to headers for backward compatibility
    tools: serverInfo.default_permissions || {
      allowed: null, // null means all tools allowed
      blocked: [],
      rateLimit: null,
      logCalls: true,
    },
  };

  c.set('serverConfig', config);
  await next();
});
