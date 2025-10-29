import { Redis, Cluster, RedisOptions, ClusterOptions } from 'ioredis';
import { createAzureRedisClient } from './azure';
import { CACHE_STORES, getRedisConfig } from './config';
import { logger } from '../../shared/utils/logger';
import { Environment } from '../../utils/env';

const {
  REDIS_TLS_ENABLED: redisTLS,
  REDIS_MODE: redisMode,
  CACHE_STORE: cacheStore,
  REDIS_SCALE_READS: redisScaleReads,
} = Environment({});

const { redisTLSCaCerts, redisUrl, redisPassword, redisUsername } =
  getRedisConfig();

if (!redisUrl) {
  logger.error(
    'Redis cannot be initialized because of missing environment variable: REDIS_URL'
  );
  process.exit(1);
}

const redisOptions: RedisOptions | ClusterOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  connectTimeout: 20000,
  retryStrategy: (times: any) => Math.min(times * 1000, 3000),
  tls: redisTLS === 'true' ? {} : undefined,
  ...(redisPassword && { password: redisPassword }),
  ...(redisUsername && { username: redisUsername }),
};

if (redisTLSCaCerts && redisTLS === 'true') {
  redisOptions.tls = {
    ca: [redisTLSCaCerts],
  };
}

if (cacheStore === 'aws-elastic-cache' && redisTLS === 'true') {
  redisOptions.tls = { rejectUnauthorized: false };
  (redisOptions as ClusterOptions).dnsLookup = (
    address: string,
    callback: (err: Error | null, address: string) => void
  ) => callback(null, address);
}

let redisClient: Redis | Cluster;
let redisReaderClient: Cluster | undefined;

async function initializeRedis() {
  if (cacheStore === CACHE_STORES.AZURE_REDIS) {
    redisClient = await createAzureRedisClient();
  } else {
    if (redisMode === 'cluster') {
      redisClient = new Cluster([redisUrl], {
        ...redisOptions,
        redisOptions: redisOptions,
        slotsRefreshTimeout: 10000,
      });
      if (redisScaleReads === 'true') {
        redisReaderClient = new Cluster([redisUrl], {
          ...redisOptions,
          redisOptions: redisOptions,
          slotsRefreshTimeout: 10000,
          scaleReads: 'slave',
        });
      }
    } else {
      redisClient = new Redis(redisUrl, redisOptions);
    }

    redisClient.on('error', (error) => {
      logger.error('Redis client error:', error);
    });

    redisClient.on('connect', () => {
      logger.info(
        `Redis client connected in ${redisMode || 'standalone'} mode`
      );
    });

    redisClient.on('close', () => {
      logger.info('Redis client closed');
    });

    if (redisReaderClient) {
      redisReaderClient.on('error', (error) => {
        logger.error('Redis reader client error:', error);
      });

      redisReaderClient.on('connect', () => {
        logger.info(
          `Redis reader client connected in ${redisMode || 'standalone'} mode`
        );
      });

      redisReaderClient.on('close', () => {
        logger.info('Redis reader client closed');
      });
    }
  }
}

await initializeRedis();

export { redisClient, redisReaderClient };
