import { Context } from 'hono';
import {
  authNRequestDurationMilliseconds,
  apiKeyRateLimitCheckDurationMilliseconds,
  portkeyMiddlewarePreRequestDurationMilliseconds,
  portkeyMiddlewarePostRequestDurationMilliseconds,
  llmCacheProcessingDurationMilliseconds,
} from './prometheusClient';
import { METRICS_KEYS } from '../../globals';
import { logger } from '..';

export const addMiddlewareMetrics = (
  c: Context,
  labels: Record<string, any>
) => {
  try {
    const authNStart = c.get(METRICS_KEYS.AUTH_N_MIDDLEWARE_START);
    const authNEnd = c.get(METRICS_KEYS.AUTH_N_MIDDLEWARE_END);
    if (authNStart && authNEnd) {
      authNRequestDurationMilliseconds
        .labels(labels)
        .observe(authNEnd - authNStart);
    }

    const apiKeyRateLimitCheckStart = c.get(
      METRICS_KEYS.API_KEY_RATE_LIMIT_CHECK_START
    );
    const apiKeyRateLimitCheckEnd = c.get(
      METRICS_KEYS.API_KEY_RATE_LIMIT_CHECK_END
    );
    if (apiKeyRateLimitCheckStart && apiKeyRateLimitCheckEnd) {
      apiKeyRateLimitCheckDurationMilliseconds
        .labels(labels)
        .observe(apiKeyRateLimitCheckEnd - apiKeyRateLimitCheckStart);
    }

    const portkeyPreRequestStart = c.get(
      METRICS_KEYS.PORTKEY_MIDDLEWARE_PRE_REQUEST_START
    );
    const portkeyPreRequestEnd = c.get(
      METRICS_KEYS.PORTKEY_MIDDLEWARE_PRE_REQUEST_END
    );
    if (portkeyPreRequestStart && portkeyPreRequestEnd) {
      portkeyMiddlewarePreRequestDurationMilliseconds
        .labels(labels)
        .observe(portkeyPreRequestEnd - portkeyPreRequestStart);
    }

    const portkeyPostRequestStart = c.get(
      METRICS_KEYS.PORTKEY_MIDDLEWARE_POST_REQUEST_START
    );
    const portkeyPostRequestEnd = c.get(
      METRICS_KEYS.PORTKEY_MIDDLEWARE_POST_REQUEST_END
    );
    if (portkeyPostRequestStart && portkeyPostRequestEnd) {
      portkeyMiddlewarePostRequestDurationMilliseconds
        .labels(labels)
        .observe(portkeyPostRequestEnd - portkeyPostRequestStart);
    }

    const cacheStart = c.get(METRICS_KEYS.LLM_CACHE_GET_START);
    const cacheEnd = c.get(METRICS_KEYS.LLM_CACHE_GET_END);
    if (cacheStart && cacheEnd) {
      llmCacheProcessingDurationMilliseconds
        .labels(labels)
        .observe(cacheEnd - cacheStart);
    }
  } catch (error) {
    logger.error({
      message: `Error adding middleware metrics: ${error}`,
    });
  }
};
