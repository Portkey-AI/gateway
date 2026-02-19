import { redisClient } from '../data-stores/redis';
import { Environment } from '../utils/env';
import { analyticsBatchInsertWorker } from './analyticsBatchInsertWorker';
import { logReplicaSyncWorker } from './logReplicaSyncWorker';
import { resyncDataWorker } from './resyncDataWorker';
import { syncDataWorker } from './syncDataWorker';
import { syncDataMasterWorker } from './syncDataMasterWorker';
import { CACHE_STORES } from '../data-stores/redis/config';
import { QueueOptions, WorkerOptions } from 'bullmq';

export interface QueueConfig {
  name: string;
  processor: (job?: any) => Promise<boolean>;
  options: QueueOptions;
  workerOptions?: WorkerOptions;
  cronJob?: {
    name: string;
    pattern: string;
    data?: any;
  };
}

const env = Environment({});
const isMemoryCache = env.CACHE_STORE === CACHE_STORES.MEMORY;

// When using in-memory cache, redisClient will be undefined
// BullMQ queues require Redis, so they won't work with in-memory cache
const baseOptions: QueueOptions = {
  connection: redisClient as any,
  // prefix: '{bull}',
};

if (!isMemoryCache && env.REDIS_MODE === 'cluster') {
  baseOptions.prefix = '{bull}';
}

const isLogReplicationEnabled =
  Environment({}).ANALYTICS_REPLICATION_ENABLED === 'true';

export const queueConfigs: QueueConfig[] = [
  {
    name: 'syncDataQueue',
    processor: syncDataWorker,
    options: {
      ...baseOptions,
      defaultJobOptions: {
        removeOnComplete: {
          count: 1,
        },
        removeOnFail: {
          count: 5000,
        },
      },
    },
    workerOptions: {
      ...baseOptions,
      concurrency: 10,
    },
  },
  {
    name: 'reSyncDataQueue',
    processor: resyncDataWorker,
    options: {
      ...baseOptions,
      defaultJobOptions: {
        removeOnComplete: {
          count: 1,
        },
        removeOnFail: {
          count: 5000,
        },
      },
    },
    cronJob: {
      name: 'reSyncDataJob',
      pattern: '*/1 * * * *', // Every 1 minute
      data: {},
    },
  },
  {
    name: 'analyticsBatchInsertQueue',
    processor: analyticsBatchInsertWorker,
    options: {
      ...baseOptions,
      defaultJobOptions: {
        removeOnComplete: {
          count: 1,
        },
        removeOnFail: {
          count: 100,
        },
      },
    },
    workerOptions: {
      ...baseOptions,
      concurrency: 3,
    },
  },
  ...(isLogReplicationEnabled
    ? [
        {
          name: 'logReplicaSyncQueue',
          processor: logReplicaSyncWorker,
          options: {
            ...baseOptions,
            defaultJobOptions: {
              removeOnComplete: {
                count: 1,
              },
              removeOnFail: {
                count: 100,
              },
            },
          },
          workerOptions: {
            ...baseOptions,
            concurrency: 3,
          },
        },
      ]
    : []),
  {
    name: 'syncDataMasterQueue',
    processor: syncDataMasterWorker,
    options: {
      ...baseOptions,
      defaultJobOptions: {
        removeOnComplete: {
          count: 1,
        },
        removeOnFail: {
          count: 5000,
        },
      },
    },
    cronJob: {
      name: 'syncDataMasterJob',
      pattern: '*/1 * * * *',
    },
  },
];
