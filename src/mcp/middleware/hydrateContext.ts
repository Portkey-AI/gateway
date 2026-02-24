import { createMiddleware } from 'hono/factory';
import { ServerConfig } from '../types/mcp';
import { createLogger } from '../../shared/utils/logger';
import { McpCacheService, getConfigCache } from '../services/mcpCacheService';
import { ControlPlane } from './controlPlane';
import { Context, Next } from 'hono';
import { Environment } from '../../utils/env';

const logger = createLogger('mcp/hydrateContext');

const TTL = 1 * 60 * 1000;

let LOCAL_CONFIGS_LOADED: boolean = false;

/**
 * Check if this is a managed SaaS deployment
 * External auth is only allowed for enterprise deployments
 */
const isManagedDeployment = (): boolean => {
  return Environment({}).MANAGED_DEPLOYMENT === 'ON';
};

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
  configCache: McpCacheService
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
  serverId: string,
  organisationId?: string
) => {
  try {
    logger.debug(`Fetching server from control plane`);

    const serverInfo: any = await cp.getMCPServer(
      workspaceId,
      serverId,
      organisationId
    );

    if (serverInfo) {
      return {
        serverId,
        workspaceId,
        organisationId,
        url: serverInfo.mcp_integration_details?.url,
        headers:
          serverInfo.mcp_integration_details?.configurations?.headers ||
          serverInfo.default_headers ||
          {},
        passthroughHeaders:
          serverInfo.mcp_integration_details?.configurations
            ?.passthrough_headers || undefined,
        forwardHeaders:
          serverInfo.mcp_integration_details?.configurations?.forward_headers ||
          undefined,
        auth_type: serverInfo.mcp_integration_details?.auth_type || 'none',
        type: serverInfo.mcp_integration_details?.transport || 'http',
        oauth_client_metadata:
          serverInfo.mcp_integration_details?.configurations?.oauth_metadata ||
          undefined,
        oauth_server_metadata: serverInfo.mcp_integration_details
          ?.configurations?.oauth_metadata
          ? {
              // Required fields
              issuer:
                serverInfo.mcp_integration_details.configurations.oauth_metadata
                  .issuer,
              authorization_endpoint:
                serverInfo.mcp_integration_details.configurations.oauth_metadata
                  .authorization_endpoint,
              token_endpoint:
                serverInfo.mcp_integration_details.configurations.oauth_metadata
                  .token_endpoint,
              response_types_supported: serverInfo.mcp_integration_details
                .configurations.oauth_metadata.response_types_supported || [
                'code',
              ],
              // Optional but commonly needed
              registration_endpoint:
                serverInfo.mcp_integration_details.configurations.oauth_metadata
                  .registration_endpoint,
              code_challenge_methods_supported: serverInfo
                .mcp_integration_details.configurations.oauth_metadata
                .code_challenge_methods_supported || ['S256'],
              token_endpoint_auth_methods_supported:
                serverInfo.mcp_integration_details.configurations.oauth_metadata
                  .token_endpoint_auth_methods_supported,
              grant_types_supported:
                serverInfo.mcp_integration_details.configurations.oauth_metadata
                  .grant_types_supported,
              scopes_supported:
                serverInfo.mcp_integration_details.configurations.oauth_metadata
                  .scopes_supported,
              revocation_endpoint:
                serverInfo.mcp_integration_details.configurations.oauth_metadata
                  .revocation_endpoint,
            }
          : undefined,
        user_identity_forwarding:
          serverInfo.mcp_integration_details?.configurations
            ?.user_identity_forwarding || undefined,
        jwt_validation:
          serverInfo.mcp_integration_details?.configurations?.jwt_validation ||
          undefined,
        // External auth configuration for servers that handle OAuth externally
        // Note: external_auth_config is only allowed for enterprise deployments
        external_auth_config:
          !isManagedDeployment() &&
          serverInfo.mcp_integration_details?.configurations
            ?.external_auth_config
            ? {
                issuer:
                  serverInfo.mcp_integration_details.configurations
                    .external_auth_config.issuer,
                authorization_endpoint:
                  serverInfo.mcp_integration_details.configurations
                    .external_auth_config.authorization_endpoint,
                token_endpoint:
                  serverInfo.mcp_integration_details.configurations
                    .external_auth_config.token_endpoint,
                registration_endpoint:
                  serverInfo.mcp_integration_details.configurations
                    .external_auth_config.registration_endpoint,
                revocation_endpoint:
                  serverInfo.mcp_integration_details.configurations
                    .external_auth_config.revocation_endpoint,
                code_challenge_methods_supported: serverInfo
                  .mcp_integration_details.configurations.external_auth_config
                  .code_challenge_methods_supported || ['S256'],
                token_endpoint_auth_methods_supported:
                  serverInfo.mcp_integration_details.configurations
                    .external_auth_config.token_endpoint_auth_methods_supported,
                grant_types_supported:
                  serverInfo.mcp_integration_details.configurations
                    .external_auth_config.grant_types_supported,
                scopes_supported:
                  serverInfo.mcp_integration_details.configurations
                    .external_auth_config.scopes_supported,
                response_types_supported: serverInfo.mcp_integration_details
                  .configurations.external_auth_config
                  .response_types_supported || ['code'],
                client_id:
                  serverInfo.mcp_integration_details.configurations
                    .external_auth_config.client_id,
                client_secret:
                  serverInfo.mcp_integration_details.configurations
                    .external_auth_config.client_secret,
                scope:
                  serverInfo.mcp_integration_details.configurations
                    .external_auth_config.scope,
              }
            : undefined,
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
  c: any,
  organisationId?: string
): Promise<any> => {
  const configCache = getConfigCache();
  const cacheKey = `${workspaceId}/${serverId}`;

  const cached = await configCache.get(cacheKey);
  if (cached) return cached;

  const CP = c.get('controlPlane');
  if (CP) {
    const serverInfo = await getFromCP(
      CP,
      Environment({}).MCP_WORKSPACE_ID || workspaceId,
      serverId,
      organisationId || Environment({}).MCP_ORGANISATION_ID
    );

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
  const workspaceId =
    c.req.param('workspaceId') !== undefined
      ? c.req.param('workspaceId')
      : c.get('tokenInfo')?.workspace_id;
  const organisationId = c.get('tokenInfo')?.organisation_id;

  if (!serverId || !workspaceId) {
    return next();
  }

  // Check cache for server config
  const serverInfo = await getServerConfig(
    workspaceId,
    serverId,
    c,
    organisationId
  );
  if (serverInfo) return success(c, serverInfo, next);

  return error(c, workspaceId, serverId);
});
