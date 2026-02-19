import Redis, { Cluster, ClusterOptions, RedisOptions } from 'ioredis';
import { logger } from '../../apm';
import {
  fetchEntraIdToken,
  fetchManagedIdentityToken,
} from '../../utils/azureAuth';
import {
  AZURE_REDIS_RESOURCE,
  AZURE_REDIS_SCOPE,
  REDIS_MODES,
  RedisConfig,
} from './config';

// Azure Redis authentication types and constants
interface AzureAccessToken {
  token: string;
  expiresOnTimestamp: number;
  oid: string;
}

interface AzureRedisClients {
  client: Redis | Cluster;
  readerClient?: Cluster;
}

const TOKEN_REFRESH_BUFFER_MIN = 120000; // 2 minutes
const TOKEN_REFRESH_BUFFER_MAX = 300000; // 5 minutes

// Generate random number between min and max
function randomNumber(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Extract username (oid) and expiration from JWT token
function parseAzureToken(tokenString: string): AzureAccessToken {
  try {
    const parts = tokenString.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT token format');
    }
    const base64Metadata = parts[1];
    const payload = JSON.parse(
      Buffer.from(base64Metadata, 'base64').toString('utf8')
    );
    // For managed identity, sometimes the user identifier is in 'sub' instead of 'oid'
    const userId = payload.oid || payload.sub || payload.appid;
    if (!userId) {
      throw new Error('No user identifier found in token (oid, sub, or appid)');
    }
    return {
      token: tokenString,
      expiresOnTimestamp: payload.exp * 1000,
      oid: userId,
    };
  } catch (error) {
    logger.error('Failed to parse Azure token:', error);
    throw error;
  }
}

// Module-level state for token management (scoped per initialization)
interface AzureRedisState {
  accessTokenCache?: AzureAccessToken;
  client?: Redis | Cluster;
  readerClient?: Cluster;
  tokenRefreshTimeoutId?: NodeJS.Timeout;
  pingIntervalId?: NodeJS.Timeout;
  config?: RedisConfig;
}

const state: AzureRedisState = {};

// Get Azure token based on auth mode
async function getAzureRedisToken(): Promise<AzureAccessToken | null> {
  if (!state.config) {
    throw new Error('Azure Redis config not initialized');
  }

  const { azureRedisConfig } = state.config;

  try {
    let tokenString: string | undefined;
    const authMode = azureRedisConfig.authMode;
    logger.info(`Getting Azure Redis token using ${authMode} mode`);

    if (authMode === 'managed') {
      tokenString = await fetchManagedIdentityToken(
        AZURE_REDIS_RESOURCE,
        azureRedisConfig.managedClientId
      );
    } else if (authMode === 'entra') {
      const { entraTenantId, entraClientId, entraClientSecret } =
        azureRedisConfig;
      if (!entraTenantId || !entraClientId || !entraClientSecret) {
        throw new Error('Missing required Entra ID parameters');
      }
      tokenString = await fetchEntraIdToken(
        entraTenantId,
        entraClientId,
        entraClientSecret,
        AZURE_REDIS_SCOPE
      );
    } else {
      throw new Error(
        `Invalid auth mode: ${authMode}. Must be 'managed' or 'entra'`
      );
    }

    if (!tokenString) {
      logger.error('No token received from Azure');
      return null;
    }

    logger.info('Token received, length:', tokenString.length);
    return parseAzureToken(tokenString);
  } catch (error) {
    logger.error(
      `Failed to get Azure Redis token (${azureRedisConfig.authMode}):`,
      error
    );
    return null;
  }
}

async function updateToken(): Promise<void> {
  if (!state.config) {
    throw new Error('Azure Redis config not initialized');
  }

  const { redisMode } = state.config;

  try {
    logger.info('Updating Azure Redis token...');
    const token = await getAzureRedisToken();
    if (!token) {
      throw new Error('Failed to get Azure Redis token');
    }
    state.accessTokenCache = token;

    // Schedule next token refresh with random buffer
    const randomTimestamp = randomNumber(
      TOKEN_REFRESH_BUFFER_MIN,
      TOKEN_REFRESH_BUFFER_MAX
    );
    const timeUntilRefresh = Math.max(
      30000, // Minimum 30 seconds
      state.accessTokenCache.expiresOnTimestamp - randomTimestamp - Date.now()
    );
    state.tokenRefreshTimeoutId = setTimeout(updateToken, timeUntilRefresh);

    // Re-authenticate existing Redis clients if they exist
    const clients = [state.client, state.readerClient].filter(Boolean) as (
      | Redis
      | Cluster
    )[];

    for (const client of clients) {
      if (client) {
        logger.info('Re-authenticating Redis client...');
        try {
          const redisUser = getUsername();
          const redisPassword = state.accessTokenCache!.token;
          if (client instanceof Cluster || redisMode === REDIS_MODES.CLUSTER) {
            // For cluster, authenticate all nodes
            const nodes = (client as Cluster).nodes('all');
            await Promise.all(
              nodes.map((node) => node.auth(redisUser, redisPassword))
            );
          } else {
            await client.auth(redisUser, redisPassword);
          }
          logger.info('Azure Redis token refreshed successfully');
        } catch (authError) {
          logger.error(
            'Failed to re-authenticate Redis with new token:',
            authError
          );
        }
      }
    }
  } catch (error) {
    logger.error('Failed to refresh Redis auth:', error);
    // Retry in 30 seconds on failure
    state.tokenRefreshTimeoutId = setTimeout(updateToken, 30000);
  }
}

// Get username - use service principal ID if available, otherwise extract from token
function getUsername(): string {
  if (state.accessTokenCache) {
    return state.accessTokenCache.oid;
  }
  throw new Error('No username available');
}

// Parse Redis URL and determine if it's cluster mode
function parseRedisUrl(
  redisUrl: string,
  redisMode: string
): {
  hostname: string;
  port: number;
  isCluster: boolean;
  hosts: { host: string; port: number }[];
} {
  const url = new URL(redisUrl);
  const hostname = url.hostname;
  const port = url.port ? parseInt(url.port) : 6380;
  const isCluster = redisMode === REDIS_MODES.CLUSTER;
  return {
    hostname,
    port,
    isCluster,
    hosts: isCluster ? [{ host: hostname, port }] : [],
  };
}

// Build common Redis options for Azure
function buildAzureRedisOptions(
  config: { hostname: string; port: number },
  redisTLSCaCerts?: Buffer
): RedisOptions & { dnsLookup?: ClusterOptions['dnsLookup'] } {
  return {
    username: state.accessTokenCache!.oid,
    password: state.accessTokenCache!.token,
    tls: {
      host: config.hostname,
      port: config.port,
      ...(redisTLSCaCerts && { ca: [redisTLSCaCerts] }),
    },
    keepAlive: 0,
    maxRetriesPerRequest: null,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 1000, 3000);
      logger.info(`Redis retry attempt ${times}, delay: ${delay}ms`);
      return delay;
    },
  };
}

// DNS lookup function for Azure Redis (resolves DNS issues with Azure)
const azureDnsLookup: ClusterOptions['dnsLookup'] = (
  address: string,
  callback: (err: Error | null, address: string) => void
) => callback(null, address);

// Attach event handlers to Redis client
function attachEventHandlers(
  client: Redis | Cluster,
  clientType: 'primary' | 'reader'
): void {
  client.on('error', async (error) => {
    logger.error(`Azure Redis ${clientType} client error:`, error);
    if (error.message.includes('WRONGPASS') || error.message.includes('auth')) {
      logger.info('Authentication error detected, refreshing token...');
      try {
        await updateToken();
      } catch (authError) {
        logger.error('Failed to recover from authentication error:', authError);
      }
    }
  });

  client.on('connect', () => {
    logger.info(`Azure Redis ${clientType} client connected`);
  });

  client.on('ready', () => {
    logger.info(`Azure Redis ${clientType} client ready`);
  });

  client.on('close', () => {
    logger.info(`Azure Redis ${clientType} client connection closed`);
  });
}

// Attach cluster-specific event handlers
function attachClusterEventHandlers(
  cluster: Cluster,
  clientType: 'primary' | 'reader'
): void {
  cluster.on('node error', (error, address) => {
    logger.error(
      `Azure Redis ${clientType} cluster node error at ${address}:`,
      error
    );
  });

  cluster.on('+node', (node) => {
    logger.info(
      `Azure Redis ${clientType} cluster node added: ${node.options.host}:${node.options.port}`
    );
  });

  cluster.on('-node', (node) => {
    logger.info(
      `Azure Redis ${clientType} cluster node removed: ${node.options.host}:${node.options.port}`
    );
  });
}

/**
 * Creates Azure Redis client(s) with Entra ID or Managed Identity authentication
 * @param config - Redis configuration from getRedisConfig()
 * @param enableReaderClient - Whether to create a reader client for read scaling
 * @returns Object containing primary client and optional reader client
 */
export async function createAzureRedisClient(
  config: RedisConfig,
  enableReaderClient = false
): Promise<AzureRedisClients> {
  logger.info('Creating Azure Redis client...');

  // Store config in state for token refresh
  state.config = config;

  const { redisUrl, redisMode, redisTLSCaCerts, azureRedisConfig } = config;

  // Validate auth mode first
  const authMode = azureRedisConfig.authMode;
  if (!authMode || !['managed', 'entra'].includes(authMode)) {
    throw new Error('Azure Redis auth not configured or invalid auth mode');
  }

  // Get initial token
  await updateToken();
  if (!state.accessTokenCache) {
    throw new Error('Failed to get initial Azure Redis token');
  }

  // Extract connection details from Redis URL
  if (!redisUrl) {
    throw new Error('REDIS_URL environment variable is required');
  }

  const parsedConfig = parseRedisUrl(redisUrl, redisMode);
  const commonOptions = buildAzureRedisOptions(parsedConfig, redisTLSCaCerts);

  // Create Redis client based on REDIS_MODE
  if (parsedConfig.isCluster) {
    logger.info('Creating Azure Redis cluster client...');

    const clusterOptions: ClusterOptions = {
      redisOptions: {
        ...commonOptions,
        tls: {
          ...(redisTLSCaCerts && { ca: [redisTLSCaCerts] }),
          ...(!redisTLSCaCerts && { rejectUnauthorized: false }),
        },
      },
      dnsLookup: azureDnsLookup,
      maxRedirections: 16,
      retryDelayOnFailover: 100,
      clusterRetryStrategy: (times: number) => {
        const delay = Math.min(times * 100, 2000);
        logger.info(`Cluster retry attempt ${times}, delay: ${delay}ms`);
        return delay;
      },
    };

    state.client = new Cluster(parsedConfig.hosts, clusterOptions);
    attachEventHandlers(state.client, 'primary');
    attachClusterEventHandlers(state.client as Cluster, 'primary');

    // Create reader client if enabled
    if (enableReaderClient) {
      logger.info('Creating Azure Redis cluster reader client...');
      state.readerClient = new Cluster(parsedConfig.hosts, {
        ...clusterOptions,
        scaleReads: 'slave',
      });
      attachEventHandlers(state.readerClient, 'reader');
      attachClusterEventHandlers(state.readerClient, 'reader');
    }
  } else {
    logger.info('Creating Azure Redis client in standalone mode...');
    state.client = new Redis(commonOptions);
    attachEventHandlers(state.client, 'primary');
  }

  // Setup ping heartbeat every 100s
  state.pingIntervalId = setInterval(() => {
    state.client
      ?.ping()
      .catch((err) => logger.error('Redis ping failed:', err));
    state.readerClient
      ?.ping()
      .catch((err) => logger.error('Redis reader ping failed:', err));
  }, 100000);

  logger.info(
    `Azure Redis authentication setup complete (${authMode} mode, ${redisMode} mode)`
  );

  return {
    client: state.client,
    readerClient: state.readerClient,
  };
}

// Cleanup function
export function destroyAzureRedisAuth(): void {
  if (state.tokenRefreshTimeoutId) {
    clearTimeout(state.tokenRefreshTimeoutId);
    state.tokenRefreshTimeoutId = undefined;
  }

  if (state.pingIntervalId) {
    clearInterval(state.pingIntervalId);
    state.pingIntervalId = undefined;
  }

  if (state.client) {
    state.client.disconnect();
  }

  if (state.readerClient) {
    state.readerClient.disconnect();
  }

  state.accessTokenCache = undefined;
  state.client = undefined;
  state.readerClient = undefined;
  state.config = undefined;
}
