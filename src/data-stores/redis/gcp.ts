import Redis, { Cluster, ClusterOptions, RedisOptions } from 'ioredis';
import { logger } from '../../apm';
import { getRedisConfig, REDIS_MODES, RedisConfig } from './config';
import { fetchWorkloadIdentityToken } from '../../utils/gcpAuth';

interface GCPAuthToken {
  token: string;
  expiresAt: number;
}

interface GCPRedisClients {
  client: Redis | Cluster;
}

const TOKEN_REFRESH_BUFFER_MIN = 120000; // 2 minutes
const TOKEN_REFRESH_BUFFER_MAX = 300000; // 5 minutes

// Generate random number between min and max
function randomNumber(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

interface GCPRedisState {
  authTokenCache?: GCPAuthToken;
  client?: Redis | Cluster;
  tokenRefreshTimeoutId?: NodeJS.Timeout;
  pingIntervalId?: NodeJS.Timeout;
  config?: RedisConfig;
}

const state: GCPRedisState = {};

// Get GCP token based on auth mode
async function getGCPRedisToken(): Promise<GCPAuthToken | null> {
  if (!state.config) {
    throw new Error('GCP Redis config not initialized');
  }

  const { gcpRedisConfig } = state.config;

  try {
    const authMode = gcpRedisConfig.authMode;
    logger.debug(`Getting GCP Redis token using ${authMode} auth mode`);

    if (authMode === 'workload') {
      const credentials = await fetchWorkloadIdentityToken();

      if (!credentials) {
        logger.error('No credentials received from GCP identity');
        return null;
      }

      const { access_token, expires_in } = credentials;

      return {
        token: access_token,
        expiresAt: Date.now() + expires_in * 1000,
      };
    } else {
      throw new Error(`Invalid auth mode: ${authMode}. Must be 'workload'`);
    }
  } catch (error) {
    logger.error(
      `Failed to get GCP Redis token (${gcpRedisConfig.authMode}):`,
      error
    );
    return null;
  }
}

async function updateToken(): Promise<void> {
  if (!state.config) {
    throw new Error('GCP Redis config not initialized');
  }

  const { redisMode } = state.config;

  try {
    logger.debug('Updating GCP Redis token...');
    const token = await getGCPRedisToken();
    if (!token) {
      throw new Error('Failed to get GCP Redis token');
    }
    state.authTokenCache = token;

    // Schedule next token refresh with random buffer
    const randomTimestamp = randomNumber(
      TOKEN_REFRESH_BUFFER_MIN,
      TOKEN_REFRESH_BUFFER_MAX
    );
    const timeUntilRefresh = Math.max(
      30000, // Minimum 30 seconds
      state.authTokenCache.expiresAt - randomTimestamp - Date.now()
    );
    state.tokenRefreshTimeoutId = setTimeout(updateToken, timeUntilRefresh);
    logger.debug(
      `Next token refresh scheduled in ${Math.round(timeUntilRefresh / 1000)}s`
    );

    // Re-authenticate existing Redis client if it exists
    if (state.client) {
      logger.debug('Re-authenticating Redis client...');
      try {
        const username = 'default';
        const password = state.authTokenCache.token;

        if (
          state.client instanceof Cluster ||
          redisMode === REDIS_MODES.CLUSTER
        ) {
          // For cluster, authenticate all nodes
          const nodes = (state.client as Cluster).nodes('all');
          await Promise.all(nodes.map((node) => node.auth(username, password)));
        } else {
          await state.client.auth(username, password);
        }
        logger.info('GCP Redis token refreshed successfully');
      } catch (authError) {
        logger.error('Failed to re-authenticate Redis with new token');
      }
    }
  } catch (error) {
    logger.error('Failed to refresh Redis auth');
    // Retry in 30 seconds on failure
    state.tokenRefreshTimeoutId = setTimeout(updateToken, 30000);
  }
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
  const port = url.port ? parseInt(url.port) : 6379;
  const isCluster = redisMode === REDIS_MODES.CLUSTER;
  return {
    hostname,
    port,
    isCluster,
    hosts: isCluster ? [{ host: hostname, port }] : [],
  };
}

// Build common Redis options for GCP
function buildGCPRedisOptions(
  config: { hostname: string; port: number },
  username: string,
  redisTLSCaCerts?: Buffer
): RedisOptions & { dnsLookup?: ClusterOptions['dnsLookup'] } {
  return {
    username,
    password: state.authTokenCache!.token,
    tls: redisTLSCaCerts
      ? { ca: [redisTLSCaCerts] }
      : { rejectUnauthorized: false },
    dnsLookup: (
      address: string,
      callback: (err: Error | null, address: string) => void
    ) => callback(null, address),
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 20000,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 1000, 3000);
      logger.debug(`Redis retry attempt ${times}, delay: ${delay}ms`);
      return delay;
    },
  };
}

// Attach event handlers to Redis client
function attachEventHandlers(
  client: Redis | Cluster,
  clientType: 'primary'
): void {
  client.on('error', async (error) => {
    if (error.message.includes('WRONGPASS') || error.message.includes('auth')) {
      logger.error('Authentication error detected, refreshing token...');
      try {
        await updateToken();
      } catch (authError) {
        logger.error('Failed to recover from authentication error');
      }
    } else {
      logger.error({
        message: `GCP Redis ${clientType} client error`,
        name: error.name,
        code: (error as any).code,
      });
    }
  });

  client.on('connect', () => {
    logger.info(`GCP Redis ${clientType} client connected`);
  });

  client.on('ready', () => {
    logger.info(`GCP Redis ${clientType} client ready`);
  });

  client.on('close', () => {
    logger.info(`GCP Redis ${clientType} client connection closed`);
  });
}

// Attach cluster-specific event handlers
function attachClusterEventHandlers(
  cluster: Cluster,
  clientType: 'primary'
): void {
  cluster.on('node error', async (error, address) => {
    if (error.message.includes('WRONGPASS') || error.message.includes('auth')) {
      logger.error('Authentication error detected, refreshing token...');
      try {
        await updateToken();
      } catch (authError) {
        logger.error('Failed to recover from authentication error');
      }
    } else {
      logger.error({
        message: 'GCP Redis cluster node error (non-authentication related)',
        name: error.name,
        code: (error as any).code,
      });
    }
  });

  cluster.on('failover', () => {
    logger.info(`GCP Redis ${clientType} cluster failover occurred`);
  });

  cluster.on('+node', (node) => {
    logger.info(
      `GCP Redis ${clientType} cluster node added: ${node.options.host}:${node.options.port}`
    );
  });

  cluster.on('-node', (node) => {
    logger.info(
      `GCP Redis ${clientType} cluster node removed: ${node.options.host}:${node.options.port}`
    );
  });
}

export async function createGCPRedisClient(): Promise<GCPRedisClients> {
  logger.debug('Creating GCP Redis client...');

  const config = getRedisConfig();

  state.config = config;

  const {
    redisMode,
    redisUrl,
    redisTLSCaCerts,
    redisUsername,
    gcpRedisConfig,
  } = config;

  const authMode = gcpRedisConfig.authMode;
  if (!authMode || authMode !== 'workload') {
    throw new Error('GCP Redis auth not configured or invalid auth mode');
  }

  await updateToken();
  if (!state.authTokenCache) {
    throw new Error('Failed to get initial GCP Redis token');
  }

  if (!redisUrl) {
    throw new Error('REDIS_URL environment variable is required');
  }

  const parsedConfig = parseRedisUrl(redisUrl, redisMode);
  const username = redisUsername || 'default';
  const commonOptions = buildGCPRedisOptions(
    parsedConfig,
    username,
    redisTLSCaCerts
  );

  if (parsedConfig.isCluster) {
    logger.debug('Creating GCP Redis cluster client...');

    const clusterOptions: ClusterOptions = {
      redisOptions: {
        ...commonOptions,
        tls: redisTLSCaCerts
          ? { ca: [redisTLSCaCerts] }
          : { rejectUnauthorized: false },
      },
      slotsRefreshTimeout: 10000,
      maxRedirections: 16,
      retryDelayOnFailover: 100,
      clusterRetryStrategy: (times: number) => {
        const delay = Math.min(times * 100, 2000);
        logger.debug(`Cluster retry attempt ${times}, delay: ${delay}ms`);
        return delay;
      },
    };

    state.client = new Cluster(parsedConfig.hosts, clusterOptions);
    attachEventHandlers(state.client, 'primary');
    attachClusterEventHandlers(state.client as Cluster, 'primary');
  } else {
    logger.info('Creating GCP Redis client in standalone mode...');
    state.client = new Redis(parsedConfig.hostname, {
      ...commonOptions,
      port: parsedConfig.port,
    });
    attachEventHandlers(state.client, 'primary');
  }

  // Setup ping heartbeat every 100s
  state.pingIntervalId = setInterval(() => {
    state.client?.ping().catch((err) =>
      logger.error({
        message: 'GCP Redis ping failed',
        errorMessage: err.message,
        code: (err as any).code,
      })
    );
  }, 100000);

  logger.info(
    `GCP Redis authentication setup complete using ${redisMode} mode`
  );

  return {
    client: state.client,
  };
}

// Cleanup function
export function destroyGCPMemoryStoreAuth(): void {
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

  state.authTokenCache = undefined;
  state.client = undefined;
  state.config = undefined;
}
