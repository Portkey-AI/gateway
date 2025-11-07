import client from 'prom-client';
import { loadAndValidateEnv } from './envConfig';
import os from 'os';
import { Environment } from '../../utils/env';

const envVars = loadAndValidateEnv();

const register = client.register;

register.setDefaultLabels({
  app: envVars.SERVICE_NAME,
  env: envVars.NODE_ENV,
});

client.collectDefaultMetrics({
  prefix: 'node_',
  gcDurationBuckets: [
    0.001, 0.01, 0.1, 1, 1.5, 2, 3, 5, 7, 10, 15, 20, 30, 45, 60, 90, 120, 240,
    500, 1000, 6000,
  ],
  register,
});

const loadMetadataKeys = () => {
  return (
    Environment()
      .PROMETHEUS_LABELS_METADATA_ALLOWED_KEYS?.replaceAll(' ', '')
      .split(',') ?? []
  ).map((key: string) => `metadata_${key}`);
};

export const metadataKeys = loadMetadataKeys();

// Create request counter
export const requestCounter = new client.Counter({
  name: 'request_count',
  help: 'Request count to the Gateway',
  labelNames: [
    'method',
    'endpoint',
    'code',
    ...metadataKeys,
    'provider',
    'model',
    'source',
    'stream',
    'cacheStatus',
    'payloadSizeRange',
  ],
  registers: [register],
});

// Create HTTP request duration histogram
export const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: [
    'method',
    'endpoint',
    'code',
    ...metadataKeys,
    'provider',
    'model',
    'source',
    'stream',
    'cacheStatus',
    'payloadSizeRange',
  ],
  buckets: [
    0.1, 1, 1.5, 2, 3, 5, 7, 10, 15, 20, 30, 45, 60, 90, 120, 240, 500, 1000,
    3000,
  ],
  registers: [register],
});

// Create LLM request duration histogram
export const llmRequestDurationMilliseconds = new client.Histogram({
  name: 'llm_request_duration_milliseconds',
  help: 'Duration of LLM requests in milliseconds',
  labelNames: [
    'method',
    'endpoint',
    'code',
    ...metadataKeys,
    'provider',
    'model',
    'source',
    'stream',
    'cacheStatus',
    'payloadSizeRange',
  ],
  buckets: [
    0.1, 1, 2, 5, 10, 30, 50, 75, 100, 150, 200, 350, 500, 1000, 2500, 5000,
    10000, 50000, 100000, 300000, 500000, 10000000,
  ],
  registers: [register],
});

// Create Portkey processing time excluding last byte latency histogram
export const portkeyProcessingTimeExcludingLastByteMs = new client.Histogram({
  name: 'portkey_processing_time_excluding_last_byte_ms',
  help: 'Portkey processing time excluding the time taken to receive the last byte of the response from the provider',
  labelNames: [
    'method',
    'endpoint',
    'code',
    ...metadataKeys,
    'provider',
    'model',
    'source',
    'stream',
    'cacheStatus',
    'payloadSizeRange',
  ],
  buckets: [
    0.1, 1, 2, 5, 10, 30, 50, 75, 100, 150, 200, 350, 500, 1000, 2500, 5000,
    10000, 50000, 100000, 300000, 500000, 10000000,
  ],
  registers: [register],
});

// Create LLM Last byte request duration histogram
export const llmLastByteDiffDurationMilliseconds = new client.Histogram({
  name: 'llm_last_byte_diff_duration_milliseconds',
  help: 'Duration of LLM last byte diff duration in milliseconds',
  labelNames: [
    'method',
    'endpoint',
    'code',
    ...metadataKeys,
    'provider',
    'model',
    'source',
    'stream',
    'cacheStatus',
    'payloadSizeRange',
  ],
  buckets: [
    0.1, 1, 2, 5, 10, 30, 50, 75, 100, 150, 200, 350, 500, 1000, 2500, 5000,
    10000, 50000, 100000, 300000, 500000, 10000000,
  ],
  registers: [register],
});

// Create Portkey request duration histogram
export const portkeyRequestDurationMilliseconds = new client.Histogram({
  name: 'portkey_request_duration_milliseconds',
  help: 'Duration of Portkey requests in milliseconds',
  labelNames: [
    'method',
    'endpoint',
    'code',
    ...metadataKeys,
    'provider',
    'model',
    'source',
    'stream',
    'cacheStatus',
    'payloadSizeRange',
  ],
  buckets: [
    0.1, 1, 2, 5, 10, 30, 50, 75, 100, 150, 200, 350, 500, 1000, 2500, 5000,
    10000, 50000, 100000, 300000, 500000, 10000000,
  ],
  registers: [register],
});

// Create LLM cost sum gauge
export const llmCostSum = new client.Gauge({
  name: 'llm_cost_sum',
  help: 'Total sum of LLM costs',
  labelNames: [
    'method',
    'endpoint',
    'code',
    ...metadataKeys,
    'provider',
    'model',
    'source',
    'stream',
    'cacheStatus',
    'payloadSizeRange',
  ],
  registers: [register],
});

// Create AuthN request duration histogram
export const authNRequestDurationMilliseconds = new client.Histogram({
  name: 'authentication_duration_milliseconds',
  help: 'Authentication: api key validity, and api key usage limits',
  labelNames: [
    'method',
    'endpoint',
    'code',
    ...metadataKeys,
    'provider',
    'model',
    'source',
    'stream',
    'cacheStatus',
    'payloadSizeRange',
  ],
  buckets: [
    0.1, 1, 2, 5, 10, 30, 50, 75, 100, 150, 200, 350, 500, 1000, 2500, 5000,
    10000, 50000, 100000, 300000, 500000, 10000000,
  ],
  registers: [register],
});

// Create API key rate limit check duration histogram
export const apiKeyRateLimitCheckDurationMilliseconds = new client.Histogram({
  name: 'api_key_rate_limit_check_duration_milliseconds',
  help: 'API key rate limit check middleware for org, workspace, and user levels',
  labelNames: [
    'method',
    'endpoint',
    'code',
    ...metadataKeys,
    'provider',
    'model',
    'source',
    'stream',
    'cacheStatus',
    'payloadSizeRange',
  ],
  buckets: [
    0.1, 1, 2, 5, 10, 30, 50, 75, 100, 150, 200, 350, 500, 1000, 2500, 5000,
    10000, 50000, 100000, 300000, 500000, 10000000,
  ],
  registers: [register],
});

// Create pre request control plane and cache calls duration histogram
export const portkeyMiddlewarePreRequestDurationMilliseconds =
  new client.Histogram({
    name: 'pre_request_processing_duration_milliseconds',
    help: 'Creates context for the request, fills in prompt variables, fetches guardrails, fetches auth keys etc.',
    labelNames: [
      'method',
      'endpoint',
      'code',
      ...metadataKeys,
      'provider',
      'model',
      'source',
      'stream',
      'cacheStatus',
      'payloadSizeRange',
    ],
    buckets: [
      0.1, 1, 2, 5, 10, 30, 50, 75, 100, 150, 200, 350, 500, 1000, 2500, 5000,
      10000, 50000, 100000, 300000, 500000, 10000000,
    ],
    registers: [register],
  });

// Create post request control plane and cache calls duration histogram
export const portkeyMiddlewarePostRequestDurationMilliseconds =
  new client.Histogram({
    name: 'post_request_processing_duration_milliseconds',
    help: 'The request is fulfilled by this point, this is the time taken for post processing',
    labelNames: [
      'method',
      'endpoint',
      'code',
      ...metadataKeys,
      'provider',
      'model',
      'source',
      'stream',
      'cacheStatus',
      'payloadSizeRange',
    ],
    buckets: [
      0.1, 1, 2, 5, 10, 30, 50, 75, 100, 150, 200, 350, 500, 1000, 2500, 5000,
      10000, 50000, 100000, 300000, 500000, 10000000,
    ],
    registers: [register],
  });

// Create post request control plane and cache calls duration histogram
export const llmCacheProcessingDurationMilliseconds = new client.Histogram({
  name: 'llm_cache_processing_duration_milliseconds',
  help: 'The time taken to process the request from the cache',
  labelNames: [
    'method',
    'endpoint',
    'code',
    ...metadataKeys,
    'provider',
    'model',
    'source',
    'stream',
    'cacheStatus',
    'payloadSizeRange',
  ],
  buckets: [
    0.1, 1, 2, 5, 10, 30, 50, 75, 100, 150, 200, 350, 500, 1000, 2500, 5000,
    10000, 50000, 100000, 300000, 500000, 10000000,
  ],
  registers: [register],
});

// Helper function to extract custom labels
export const getCustomLabels = (metadata: string | undefined) => {
  let customLabels: Record<string, any> = {};
  const allowedKeys =
    Environment().PROMETHEUS_LABELS_METADATA_ALLOWED_KEYS?.split(',') ?? [];
  if (typeof metadata === 'string') {
    try {
      const parsedMetadata = JSON.parse(metadata);
      customLabels = Object.entries(parsedMetadata)
        .filter(([key]) => allowedKeys.includes(key))
        .reduce(
          (acc, [key, value]) => {
            acc[`metadata_${key}`] = value;
            return acc;
          },
          {} as Record<string, any>
        );
    } catch (error) {
      return '';
    }
  }
  return customLabels;
};

// Setup Pushgateway

let gateway: any;
if (envVars.PROMETHEUS_PUSH_ENABLED === 'true') {
  gateway = new client.Pushgateway(
    envVars.PROMETHEUS_GATEWAY_URL,
    {
      headers: {
        Authorization: `Basic ${envVars.PROMETHEUS_GATEWAY_AUTH}`,
      },
    },
    register
  );
}

export const pushMetrics = () => {
  if (!gateway) return;
  try {
    gateway
      .push({
        jobName: 'aggregator',
        groupings: {
          service_uid: os.hostname(),
          service: envVars.SERVICE_NAME,
          env: envVars.NODE_ENV,
        },
      })
      .catch(() => {
        // console.error('[PROMETHEUS] Unable to push to prom: ', e.message);
      });
  } catch {
    // console.error('[PROMETHEUS] Unhandled error', err.message);
  }
};

// Schedule metrics push every 30 seconds
if (envVars.PROMETHEUS_PUSH_ENABLED === 'true') {
  setInterval(() => {
    pushMetrics();
  }, 30 * 1000);
}

export { register };
