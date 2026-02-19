import { Redis, Cluster, RedisOptions, ClusterOptions } from 'ioredis';
import { createAzureRedisClient } from './azure';
import { createAWSElasticacheClient } from './aws';
import { createGCPRedisClient } from './gcp';
import {
  CACHE_STORES,
  getRedisConfig,
  getRedisClusterEndpoints,
  parseStaticRedisEndpoints,
  RedisConfig,
  isRedisCacheStore,
  hasRedisConfig,
} from './config';
import { logger } from '../../apm';
import { Environment } from '../../utils/env';
import { getRuntimeKey } from 'hono/adapter';

const {
  REDIS_TLS_ENABLED: redisTLS,
  REDIS_MODE: redisMode,
  CACHE_STORE: cacheStore,
  REDIS_SCALE_READS: redisScaleReads,
} = Environment({});

let redisClient: Redis | Cluster;
let redisReaderClient: Cluster | undefined;

interface EventHandlerOptions {
  clientType: 'primary' | 'reader';
  mode: string;
}

/**
 * Attaches common event handlers to a Redis client
 */
function attachEventHandlers(
  client: Redis | Cluster,
  options: EventHandlerOptions
): void {
  const { clientType, mode } = options;

  client.on('error', (error) => {
    if (error.message.includes('WRONGPASS') || error.message.includes('auth')) {
      logger.info(
        `Redis ${clientType} client error: Authentication error. Please check your credentials.`
      );
    } else {
      logger.error(`Redis ${clientType} client error:`, error);
    }
  });

  client.on('connect', () => {
    logger.info(`Redis ${clientType} client connected in ${mode} mode`);
  });

  client.on('close', () => {
    logger.info(`Redis ${clientType} client closed`);
  });
}

/**
 * Attaches cluster-specific event handlers
 */
function attachClusterEventHandlers(
  cluster: Cluster,
  clientType: 'primary' | 'reader'
): void {
  cluster.on('node error', (error, address) => {
    logger.error(
      `Redis ${clientType} cluster node error at ${address}:`,
      error
    );
  });

  cluster.on('+node', (node) => {
    logger.info(
      `Redis ${clientType} cluster node added: ${node.options.host}:${node.options.port}`
    );
  });

  cluster.on('-node', (node) => {
    logger.info(
      `Redis ${clientType} cluster node removed: ${node.options.host}:${node.options.port}`
    );
  });
}

function buildBaseRedisOptions(config: RedisConfig): RedisOptions {
  const { redisPassword, redisUsername, redisTLSCaCerts, redisTLS } = config;

  const options: RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 20000,
    retryStrategy: (times: number) => Math.min(times * 1000, 3000),
    tls: redisTLS === 'true' ? {} : undefined,
    ...(redisPassword && { password: redisPassword }),
    ...(redisUsername && { username: redisUsername }),
  };

  if (redisTLSCaCerts && redisTLS === 'true') {
    options.tls = {
      ca: [redisTLSCaCerts],
    };
  }

  return options;
}

function buildClusterOptions(
  baseOptions: RedisOptions,
  config: RedisConfig
): ClusterOptions {
  // Special handling for AWS ElastiCache
  if (
    config.cacheStore === CACHE_STORES.AWS_ELASTIC_CACHE &&
    config.redisTLS === 'true'
  ) {
    baseOptions.tls = { rejectUnauthorized: false };
  }

  return {
    ...baseOptions,
    redisOptions: baseOptions,
    slotsRefreshTimeout: 10000,
    enableReadyCheck: true,
    clusterRetryStrategy: (times: number) => Math.min(times * 100, 2000),
    dnsLookup:
      config.cacheStore === CACHE_STORES.AWS_ELASTIC_CACHE &&
      config.redisTLS === 'true'
        ? (
            address: string,
            callback: (err: Error | null, address: string) => void
          ) => callback(null, address)
        : undefined,
  };
}

/**
 * Converts Redis endpoints to full connection URLs with credentials
 */
function convertEndpointsToUrls(
  endpoints: string[],
  protocol: string,
  username?: string,
  password?: string
): string[] {
  return endpoints.map((endpoint) => {
    let host: string;
    let port: string;

    // Handle IPv6 format: [host]:port
    if (endpoint.startsWith('[')) {
      const match = endpoint.match(/^\[([^\]]+)\]:(\d+)$/);
      if (match) {
        host = match[1];
        port = match[2];
      } else {
        // Fallback for malformed IPv6
        const lastColon = endpoint.lastIndexOf(':');
        host = endpoint.substring(0, lastColon);
        port = endpoint.substring(lastColon + 1);
      }
    } else {
      // Standard IPv4/hostname format
      const lastColon = endpoint.lastIndexOf(':');
      host = endpoint.substring(0, lastColon);
      port = endpoint.substring(lastColon + 1);
    }

    if (username || password) {
      const encodedUsername = encodeURIComponent(username || '');
      const encodedPassword = encodeURIComponent(password || '');
      return `${protocol}${encodedUsername}:${encodedPassword}@${host}:${port}`;
    }
    return `${protocol}${host}:${port}`;
  });
}

// ============================================================================
// Client Factory Functions
// ============================================================================

interface RedisClientResult {
  client: Redis | Cluster;
  readerClient?: Cluster;
}

/**
 * Creates a standalone Redis client
 */
function createStandaloneClient(
  redisUrl: string,
  options: RedisOptions,
  mode: string
): RedisClientResult {
  logger.info('Initializing Redis in standalone mode');
  const client = new Redis(redisUrl, options);
  attachEventHandlers(client, { clientType: 'primary', mode });
  return { client };
}

/**
 * Creates cluster clients from a URL
 */
function createClusterClientFromUrl(
  redisUrl: string,
  options: ClusterOptions,
  mode: string,
  enableReader: boolean
): RedisClientResult {
  logger.info(`Initializing Redis cluster from URL in ${mode} mode`);

  const client = new Cluster([redisUrl], options);
  attachEventHandlers(client, { clientType: 'primary', mode });
  attachClusterEventHandlers(client, 'primary');

  let readerClient: Cluster | undefined;
  if (enableReader) {
    readerClient = new Cluster([redisUrl], {
      ...options,
      scaleReads: 'slave',
    });
    attachEventHandlers(readerClient, { clientType: 'reader', mode });
    attachClusterEventHandlers(readerClient, 'reader');
  }

  return { client, readerClient };
}

/**
 * Creates cluster clients from endpoint URLs
 */
function createClusterClientFromEndpoints(
  endpointUrls: string[],
  options: ClusterOptions,
  mode: string,
  enableReader: boolean
): RedisClientResult {
  logger.info(
    `Initializing Redis cluster in ${mode} mode with ${endpointUrls.length} endpoints`
  );

  const client = new Cluster(endpointUrls, options);
  attachEventHandlers(client, { clientType: 'primary', mode });
  attachClusterEventHandlers(client, 'primary');

  let readerClient: Cluster | undefined;
  if (enableReader) {
    readerClient = new Cluster(endpointUrls, {
      ...options,
      scaleReads: 'slave',
    });
    attachEventHandlers(readerClient, { clientType: 'reader', mode });
    attachClusterEventHandlers(readerClient, 'reader');
  }

  return { client, readerClient };
}

async function initializeRedis(): Promise<void> {
  const config = getRedisConfig();
  const {
    redisUrl,
    redisPassword,
    redisUsername,
    clusterEndpoints,
    clusterDiscoveryUrl,
    clusterDiscoveryAuth,
  } = config;

  // Validate configuration
  if (!redisUrl && !clusterEndpoints && !clusterDiscoveryUrl) {
    logger.error(
      'Redis cannot be initialized: Either REDIS_URL, REDIS_CLUSTER_ENDPOINTS, or REDIS_CLUSTER_DISCOVERY_URL must be provided'
    );
    process.exit(1);
  }

  if (!redisUrl && (clusterEndpoints || clusterDiscoveryUrl)) {
    logger.warn(
      'REDIS_URL not set; using cluster configuration. Fallback will not be available if cluster setup fails.'
    );
  }

  const enableReaderClient = redisScaleReads === 'true';

  // Handle Azure Redis mode
  if (cacheStore === CACHE_STORES.AZURE_REDIS) {
    logger.info('Initializing Azure Redis client');
    const result = await createAzureRedisClient(config, enableReaderClient);
    redisClient = result.client;
    redisReaderClient = result.readerClient;
    return;
  }
  // Handle AWS ElastiCache mode
  if (
    cacheStore === CACHE_STORES.AWS_ELASTIC_CACHE &&
    config.awsRedisConfig.authMode === 'iam'
  ) {
    logger.info('Initializing AWS ElastiCache Redis client');
    if (config.redisTLS !== 'true') {
      logger.debug(
        'AWS ElastiCache IAM authentication requires IAM TLS to be enabled.'
      );
      logger.debug(
        'Overriding REDIS_TLS_ENABLED to true for ElastiCache client.'
      );
      config.redisTLS = 'true';
    }
    const result = await createAWSElasticacheClient();
    redisClient = result.client;
    return;
  }
  if (cacheStore === CACHE_STORES.GCP_MEMORY_STORE) {
    logger.info('Initializing GCP Redis client');
    const result = await createGCPRedisClient();
    redisClient = result.client;
    return;
  }

  // Build options for non-Azure modes
  const baseOptions = buildBaseRedisOptions(config);
  const clusterOptions = buildClusterOptions(baseOptions, config);
  const protocol = config.redisTLS === 'true' ? 'rediss://' : 'redis://';

  // Handle static cluster endpoints
  if (clusterEndpoints) {
    try {
      const endpoints = parseStaticRedisEndpoints(clusterEndpoints);
      const endpointUrls = convertEndpointsToUrls(
        endpoints,
        protocol,
        redisUsername,
        redisPassword
      );

      const result = createClusterClientFromEndpoints(
        endpointUrls,
        clusterOptions,
        'cluster (static endpoints)',
        enableReaderClient
      );
      redisClient = result.client;
      redisReaderClient = result.readerClient;
      return;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        `Failed to initialize Redis with static cluster endpoints: ${errorMessage}`
      );

      if (redisUrl) {
        logger.info('Falling back to standard Redis URL configuration');
        const result =
          redisMode === 'cluster'
            ? createClusterClientFromUrl(
                redisUrl,
                clusterOptions,
                'cluster (fallback)',
                enableReaderClient
              )
            : createStandaloneClient(
                redisUrl,
                baseOptions,
                'standalone (fallback)'
              );
        redisClient = result.client;
        redisReaderClient = result.readerClient;
        return;
      }

      logger.error('No fallback available: REDIS_URL not provided');
      throw new Error(
        'Redis initialization failed: Static cluster endpoints failed and no fallback URL available'
      );
    }
  }

  // Handle dynamic cluster discovery
  if (clusterDiscoveryUrl) {
    try {
      const endpoints = await getRedisClusterEndpoints(
        clusterDiscoveryUrl,
        clusterDiscoveryAuth
      );
      const endpointUrls = convertEndpointsToUrls(
        endpoints,
        protocol,
        redisUsername,
        redisPassword
      );

      const result = createClusterClientFromEndpoints(
        endpointUrls,
        clusterOptions,
        'cluster (discovered)',
        enableReaderClient
      );
      redisClient = result.client;
      redisReaderClient = result.readerClient;
      return;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        `Failed to initialize Redis with cluster discovery: ${errorMessage}`
      );

      if (redisUrl) {
        logger.info('Falling back to standard Redis URL configuration');
        const result =
          redisMode === 'cluster'
            ? createClusterClientFromUrl(
                redisUrl,
                clusterOptions,
                'cluster (fallback)',
                enableReaderClient
              )
            : createStandaloneClient(
                redisUrl,
                baseOptions,
                'standalone (fallback)'
              );
        redisClient = result.client;
        redisReaderClient = result.readerClient;
        return;
      }

      logger.error('No fallback available: REDIS_URL not provided');
      throw new Error(
        'Redis initialization failed: Cluster discovery failed and no fallback URL available'
      );
    }
  }

  // Standard Redis URL configuration
  if (redisMode === 'cluster') {
    const result = createClusterClientFromUrl(
      redisUrl,
      clusterOptions,
      'cluster',
      enableReaderClient
    );
    redisClient = result.client;
    redisReaderClient = result.readerClient;
  } else {
    const result = createStandaloneClient(redisUrl, baseOptions, 'standalone');
    redisClient = result.client;
  }
}

const redisConfigAvailable = hasRedisConfig();

if (getRuntimeKey() === 'node' && cacheStore !== CACHE_STORES.MEMORY) {
  if (isRedisCacheStore(cacheStore) && !redisConfigAvailable) {
    // CACHE_STORE explicitly set to Redis variant but no Redis config - fail for backwards compatibility
    logger.error(
      'CACHE_STORE is set to a Redis variant but no Redis configuration found. ' +
        'Please set REDIS_URL, REDIS_CLUSTER_ENDPOINTS, or REDIS_CLUSTER_DISCOVERY_URL.'
    );
    process.exit(1);
  }

  if (redisConfigAvailable) {
    await initializeRedis();
  }
}

export { redisClient, redisReaderClient };
