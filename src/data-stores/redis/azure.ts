import Redis, { Cluster, ClusterOptions, RedisOptions } from 'ioredis';
import {
  getAzureManagedIdentityToken,
  getAccessTokenFromEntraId,
} from '../../providers/azure-openai/utils';
import { logger } from '../../shared/utils/logger';
import {
  AZURE_REDIS_RESOURCE,
  AZURE_REDIS_SCOPE,
  getRedisConfig,
  REDIS_MODES,
} from './config';

const { redisMode, redisUrl, redisTLSCaCerts, azureRedisConfig } =
  getRedisConfig();

// Azure Redis authentication types and constants
interface AzureAccessToken {
  token: string;
  expiresOnTimestamp: number;
  oid: string;
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

// Get Azure token based on auth mode
async function getAzureRedisToken(): Promise<AzureAccessToken | null> {
  try {
    let tokenString: string | null = null;
    const authMode = azureRedisConfig.authMode;
    logger.info(`Getting Azure Redis token using ${authMode} mode`);
    if (authMode === 'managed') {
      const token = await getAzureManagedIdentityToken(
        AZURE_REDIS_RESOURCE,
        azureRedisConfig.managedClientId
      );
      tokenString = token || null;
    } else if (authMode === 'entra') {
      const { entraTenantId, entraClientId, entraClientSecret } =
        azureRedisConfig;
      if (!entraTenantId || !entraClientId || !entraClientSecret) {
        throw new Error('Missing required Entra ID parameters');
      }
      const token = await getAccessTokenFromEntraId(
        entraTenantId,
        entraClientId,
        entraClientSecret,
        AZURE_REDIS_SCOPE
      );
      tokenString = token || null;
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

// Module-level variables for simplified token management
let accessTokenCache: AzureAccessToken | undefined;
let redis: Redis | Cluster | undefined;
let tokenRefreshTimeoutId: NodeJS.Timeout | undefined;

async function updateToken(): Promise<void> {
  try {
    logger.info('Updating Azure Redis token...');
    const token = await getAzureRedisToken();
    if (!token) {
      throw new Error('Failed to get Azure Redis token');
    }
    accessTokenCache = token;
    // Schedule next token refresh with random buffer
    const randomTimestamp = randomNumber(
      TOKEN_REFRESH_BUFFER_MIN,
      TOKEN_REFRESH_BUFFER_MAX
    );
    const timeUntilRefresh = Math.max(
      30000, // Minimum 30 seconds
      accessTokenCache.expiresOnTimestamp - randomTimestamp - Date.now()
    );
    tokenRefreshTimeoutId = setTimeout(updateToken, timeUntilRefresh);
    // Re-authenticate existing Redis client if it exists
    if (redis) {
      logger.info('Re-authenticating Redis client...');
      try {
        const redisUser = getUsername();
        const redisPassword = accessTokenCache!.token;
        if (redis instanceof Cluster || redisMode === REDIS_MODES.CLUSTER) {
          // For cluster, authenticate all nodes
          const nodes = (redis as Cluster).nodes('all');
          await Promise.all(
            nodes.map((node) => node.auth(redisUser, redisPassword))
          );
        } else {
          await redis.auth(redisUser, redisPassword);
        }
        logger.info('Azure Redis token refreshed successfully');
      } catch (authError) {
        logger.error(
          'Failed to re-authenticate Redis with new token:',
          authError
        );
      }
    }
  } catch (error) {
    logger.error('Failed to refresh Redis auth:', error);
    // Retry in 30 seconds on failure
    tokenRefreshTimeoutId = setTimeout(updateToken, 30000);
  }
}

// Get username - use service principal ID if available, otherwise extract from token
function getUsername(): string {
  if (accessTokenCache) {
    return accessTokenCache.oid;
  }
  throw new Error('No username available');
}

// Parse Redis URL and determine if it's cluster mode
function parseRedisConfig(redisUrl: string) {
  const url = new URL(redisUrl);
  const hostname = url.hostname;
  const port = url.port ? parseInt(url.port) : 6380;
  // Use existing REDIS_MODE environment variable
  const isCluster = redisMode === REDIS_MODES.CLUSTER;
  return {
    hostname,
    port,
    isCluster,
    hosts: isCluster ? [{ host: hostname, port }] : [],
  };
}

export async function createAzureRedisClient(): Promise<Redis | Cluster> {
  logger.info('Creating Azure Redis client...');
  // Validate auth mode first
  const authMode = azureRedisConfig.authMode;
  if (!authMode || !['managed', 'entra'].includes(authMode)) {
    throw new Error('Azure Redis auth not configured or invalid auth mode');
  }
  // Get initial token
  await updateToken();
  if (!accessTokenCache) {
    throw new Error('Failed to get initial Azure Redis token');
  }
  // Extract connection details from Redis URL
  if (!redisUrl) {
    throw new Error('REDIS_URL environment variable is required');
  }
  const config = parseRedisConfig(redisUrl);
  const commonOptions: RedisOptions | ClusterOptions = {
    username: accessTokenCache.oid,
    password: accessTokenCache.token,
    tls: {
      host: config.hostname,
      port: config.port,
      ...(redisTLSCaCerts && { ca: [redisTLSCaCerts] }),
    },
    dnsLookup: (
      address: string,
      callback: (err: Error | null, address: string) => void
    ) => callback(null, address),
    keepAlive: 0,
    maxRetriesPerRequest: null,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 1000, 3000);
      logger.info(`Redis retry attempt ${times}, delay: ${delay}ms`);
      return delay;
    },
  };
  // Create Redis client based on REDIS_MODE
  if (config.isCluster) {
    logger.info('Creating Redis cluster client...');
    redis = new Cluster(config.hosts, {
      redisOptions: {
        ...commonOptions,
        tls: {
          ...(redisTLSCaCerts && { ca: [redisTLSCaCerts] }),
          ...(!redisTLSCaCerts && { rejectUnauthorized: false }),
        },
      },
      maxRedirections: 16,
      retryDelayOnFailover: 100,
      clusterRetryStrategy: (times: number) => {
        const delay = Math.min(times * 100, 2000);
        logger.info(`Cluster retry attempt ${times}, delay: ${delay}ms`);
        return delay;
      },
    });
    // Cluster-specific events
    (redis as Cluster).on('node error', (error, address) => {
      logger.error(`Cluster node error at ${address}:`, error);
    });
    (redis as Cluster).on('failover', () => {
      logger.info('Redis cluster failover occurred');
    });
  } else {
    logger.info('Creating Redis client in standalone mode...');
    redis = new Redis(commonOptions);
  }

  redis.on('error', async (error) => {
    logger.error('Redis client error:', error);
    if (error.message.includes('WRONGPASS') || error.message.includes('auth')) {
      logger.info('Authentication error detected, refreshing token...');
      try {
        await updateToken();
      } catch (authError) {
        logger.error('Failed to recover from authentication error:', authError);
      }
    }
  });

  redis.on('connect', () => {
    logger.info('Azure Redis client connected');
  });

  redis.on('ready', () => {
    logger.info('Azure Redis client ready');
  });

  redis.on('close', () => {
    logger.info('Azure Redis client connection closed');
  });

  // Optional ping heartbeat every 100s (manual pingInterval equivalent)
  setInterval(() => {
    redis?.ping().catch((err) => logger.error('Redis ping failed:', err));
  }, 100000);

  logger.info(
    `Azure Redis authentication setup complete (${authMode} mode, ${redisMode} mode)`
  );
  return redis;
}

// Cleanup function
export function destroyAzureRedisAuth(): void {
  if (tokenRefreshTimeoutId) {
    clearTimeout(tokenRefreshTimeoutId);
    tokenRefreshTimeoutId = undefined;
  }
  if (redis) {
    redis.disconnect();
  }
  accessTokenCache = undefined;
  redis = undefined;
}
