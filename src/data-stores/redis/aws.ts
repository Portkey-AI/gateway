import Redis, { Cluster, ClusterOptions, RedisOptions } from 'ioredis';
import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { HttpRequest } from '@smithy/types';
import { logger } from '../../apm';
import { getRedisConfig, REDIS_MODES, RedisConfig } from './config';
import {
  fetchAssumedRoleCredentials,
  AWSCredentials,
  getRegionFromEnv,
} from '../../utils/awsAuth';

interface ElasticacheAuthToken {
  token: string;
  expiresAt: number;
}

interface AWSRedisClients {
  client: Redis | Cluster;
}

const TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes (ElastiCache token max lifetime)
const TOKEN_REFRESH_BUFFER_MIN = 120000; // 2 minutes
const TOKEN_REFRESH_BUFFER_MAX = 300000; // 5 minutes

// Generate random number between min and max
function randomNumber(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

interface AWSRedisState {
  authTokenCache?: ElasticacheAuthToken;
  client?: Redis | Cluster;
  tokenRefreshTimeoutId?: NodeJS.Timeout;
  pingIntervalId?: NodeJS.Timeout;
  config?: RedisConfig;
}

const state: AWSRedisState = {};

// Generate ElastiCache IAM auth token
async function generateElasticacheAuthToken(
  credentials: AWSCredentials,
  clusterName: string,
  region: string,
  userId: string
): Promise<ElasticacheAuthToken> {
  const service = 'elasticache';
  const expiresIn = 900; // 15 minutes in seconds

  const signer = new SignatureV4({
    service,
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      ...(credentials.sessionToken && {
        sessionToken: credentials.sessionToken,
      }),
    },
    sha256: Sha256,
  });

  // Create the request to be presigned
  const request: HttpRequest = {
    method: 'GET',
    protocol: 'https:',
    hostname: clusterName,
    path: '/',
    query: {
      Action: 'connect',
      User: userId,
    },
    headers: {
      host: clusterName,
    },
  };

  // Presign the request
  const presignedRequest = await signer.presign(request, {
    expiresIn,
  });

  // Build the token from the presigned query parameters
  const queryParams = presignedRequest.query as Record<string, string>;
  const queryString = Object.keys(queryParams)
    .sort()
    .map(
      (key) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(queryParams[key])}`
    )
    .join('&');

  const token = `${clusterName}?${queryString}`;

  return {
    token,
    expiresAt: Date.now() + TOKEN_EXPIRY_MS,
  };
}

// Get AWS ElastiCache token
async function getAWSRedisToken(): Promise<ElasticacheAuthToken | null> {
  if (!state.config) {
    throw new Error('AWS Redis config not initialized');
  }

  const { redisUsername, awsRedisConfig } = state.config;

  try {
    const authMode = awsRedisConfig.authMode;
    logger.debug({ message: `Getting AWS Redis token using ${authMode} mode` });

    const region = awsRedisConfig.region || getRegionFromEnv();
    const clusterName = awsRedisConfig.clusterName;

    if (!redisUsername) {
      throw new Error('REDIS_USERNAME is required for IAM authentication');
    }

    if (!clusterName) {
      throw new Error(
        'AWS_REDIS_CLUSTER_NAME is required for IAM authentication'
      );
    }

    const credentials = await fetchAssumedRoleCredentials(
      awsRedisConfig.assumeRoleArn,
      awsRedisConfig.externalId,
      region
    );

    if (!credentials) {
      logger.error('No credentials received from AWS');
      return null;
    }

    const token = await generateElasticacheAuthToken(
      credentials as AWSCredentials,
      clusterName,
      region,
      redisUsername
    );

    logger.debug({ message: 'AWS Redis token received' });
    return token;
  } catch (error) {
    logger.error(`Failed to get AWS Redis token (${awsRedisConfig.authMode})`);
    return null;
  }
}

async function updateToken(): Promise<void> {
  if (!state.config) {
    throw new Error('AWS Redis config not initialized');
  }

  const { redisMode, redisUsername } = state.config;

  try {
    logger.debug({ message: 'Updating AWS Redis token...' });
    const token = await getAWSRedisToken();
    if (!token) {
      throw new Error('Failed to get AWS Redis token');
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
    logger.debug({
      message: `Next token refresh scheduled in ${Math.round(timeUntilRefresh / 1000)}s`,
    });

    // Re-authenticate existing Redis client if it exists
    if (state.client) {
      logger.debug({ message: 'Re-authenticating Redis client...' });
      try {
        const username = redisUsername;
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

// Build common Redis options for AWS
function buildAWSRedisOptions(
  config: { hostname: string; port: number },
  username: string,
  redisTLSCaCerts?: Buffer
): RedisOptions & { dnsLookup?: ClusterOptions['dnsLookup'] } {
  return {
    username,
    password: state.authTokenCache!.token,
    tls: {
      rejectUnauthorized: false,
      ...(redisTLSCaCerts && { ca: [redisTLSCaCerts] }),
    },
    dnsLookup: (
      address: string,
      callback: (err: Error | null, address: string) => void
    ) => callback(null, address),
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 20000,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 1000, 3000);
      logger.debug({
        message: `Redis retry attempt ${times}, delay: ${delay}ms`,
      });
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
      logger.info({
        message: 'Authentication error detected, refreshing token...',
      });
      try {
        await updateToken();
      } catch (authError) {
        logger.error('Failed to recover from authentication error');
      }
    } else {
      logger.error({
        message: `AWS Redis ${clientType} client error`,
        name: error.name,
        code: (error as any).code,
      });
    }
  });

  client.on('connect', () => {
    logger.info(`AWS Redis ${clientType} client connected`);
  });

  client.on('ready', () => {
    logger.info(`AWS Redis ${clientType} client ready`);
  });

  client.on('close', () => {
    logger.info(`AWS Redis ${clientType} client connection closed`);
  });
}

// Attach cluster-specific event handlers
function attachClusterEventHandlers(
  cluster: Cluster,
  clientType: 'primary'
): void {
  cluster.on('node error', async (error, address) => {
    logger.error({
      message: `AWS Redis ${clientType} cluster node error at ${address}`,
      name: error.name,
      code: (error as any).code,
    });
    if (error.message.includes('WRONGPASS') || error.message.includes('auth')) {
      logger.info('Authentication error detected, refreshing token...');
      try {
        await updateToken();
      } catch (authError) {
        logger.error('Failed to recover from authentication error');
      }
    } else {
      logger.error({
        message: 'AWS Redis cluster node error (non-authentication related)',
        name: error.name,
        code: (error as any).code,
      });
    }
  });

  cluster.on('failover', () => {
    logger.info(`AWS Redis ${clientType} cluster failover occurred`);
  });

  cluster.on('+node', (node) => {
    logger.info(
      `AWS Redis ${clientType} cluster node added: ${node.options.host}:${node.options.port}`
    );
  });

  cluster.on('-node', (node) => {
    logger.info(
      `AWS Redis ${clientType} cluster node removed: ${node.options.host}:${node.options.port}`
    );
  });
}

/**
 * Creates AWS ElastiCache Redis client with IAM authentication
 * @returns Object containing primary client
 */
export async function createAWSElasticacheClient(): Promise<AWSRedisClients> {
  logger.info('Creating AWS Redis client...');

  // Get config when function is called, not at module load
  const config = getRedisConfig();

  // Store config in state for token refresh
  state.config = config;

  const {
    redisMode,
    redisUrl,
    redisTLSCaCerts,
    redisUsername,
    awsRedisConfig,
  } = config;

  // Validate auth mode first
  const authMode = awsRedisConfig.authMode;
  if (!authMode) {
    throw new Error('AWS Redis auth not configured');
  }

  // Get initial token
  await updateToken();
  if (!state.authTokenCache) {
    throw new Error('Failed to get initial AWS Redis token');
  }

  // Extract connection details from Redis URL
  if (!redisUrl) {
    throw new Error('REDIS_URL environment variable is required');
  }

  const parsedConfig = parseRedisUrl(redisUrl, redisMode);
  const username = redisUsername;
  if (!username) {
    throw new Error('REDIS_USERNAME is required for AWS IAM authentication');
  }

  const commonOptions = buildAWSRedisOptions(
    parsedConfig,
    username,
    redisTLSCaCerts
  );

  // Create Redis client based on REDIS_MODE
  if (parsedConfig.isCluster) {
    logger.info('Creating AWS Redis cluster client...');

    const clusterOptions: ClusterOptions = {
      redisOptions: {
        ...commonOptions,
        tls: {
          rejectUnauthorized: false,
          ...(redisTLSCaCerts && { ca: [redisTLSCaCerts] }),
        },
      },
      slotsRefreshTimeout: 10000,
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
  } else {
    logger.info('Creating AWS Redis client in standalone mode...');
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
        message: 'AWS Redis ping failed',
        errorMessage: err.message,
        code: (err as any).code,
      })
    );
  }, 100000);

  logger.info(
    `AWS Redis authentication setup complete (${authMode} mode, ${redisMode} mode)`
  );

  return {
    client: state.client,
  };
}

// Cleanup function
export function destroyAWSElasticacheAuth(): void {
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
