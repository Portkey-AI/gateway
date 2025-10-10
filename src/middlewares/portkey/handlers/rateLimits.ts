import {
  CACHE_STATUS,
  HEADER_KEYS,
  RATE_LIMIT_UNIT_TO_WINDOW_MAPPING,
  RateLimiterKeyTypes,
  RateLimiterTypes,
} from '../globals';
import { RateLimit, WinkyLogObject } from '../types';
import RedisRateLimiter from '../../../shared/services/cache/utils/rateLimiter';
import { getRuntimeKey } from 'hono/adapter';
import { getDefaultCache } from '../../../shared/services/cache';
import { RedisCacheBackend } from '../../../shared/services/cache/backends/redis';

export function generateRateLimitKey(
  organisationId: string,
  rateLimitType: RateLimiterTypes,
  keyType: RateLimiterKeyTypes,
  key: string,
  rateLimitUnit: string
) {
  return `${organisationId}-${
    rateLimitType || RateLimiterTypes.REQUESTS
  }-${keyType}-${key}-${rateLimitUnit}`;
}

export function preRequestRateLimitValidator({
  env,
  rateLimits,
  key,
  keyType,
  maxTokens,
  organisationId,
}: {
  env: Record<string, any>;
  rateLimits: RateLimit[];
  key: string;
  keyType: RateLimiterKeyTypes;
  maxTokens: number;
  organisationId: string;
}) {
  const promises: Promise<any>[] = [];
  for (const rateLimit of rateLimits) {
    if (rateLimit.unit && rateLimit.value) {
      const rateLimitKey = generateRateLimitKey(
        organisationId,
        rateLimit.type,
        keyType,
        key,
        rateLimit.unit
      );
      if (getRuntimeKey() === 'node') {
        const redisClient = getDefaultCache().getClient() as RedisCacheBackend;
        if (!redisClient) {
          console.warn(
            'you need to set the REDIS_CONNECTION_STRING environment variable for rate limits to wrok'
          );
          const promise = new Promise((resolve) => {
            resolve(
              new Response(
                JSON.stringify({
                  allowed: true,
                  waitTime: 0,
                })
              )
            );
          });
          promises.push(promise);
        }
        const rateLimiter = new RedisRateLimiter(
          redisClient,
          rateLimit.value,
          RATE_LIMIT_UNIT_TO_WINDOW_MAPPING[rateLimit.unit],
          rateLimitKey,
          keyType
        );
        if (rateLimit.type === RateLimiterTypes.TOKENS) {
          promises.push(
            new Promise(async (resolve) => {
              const result = await rateLimiter.checkRateLimit(maxTokens, false);
              resolve(new Response(JSON.stringify(result)));
            })
          );
        } else {
          promises.push(
            new Promise(async (resolve) => {
              const result = await rateLimiter.checkRateLimit(1, true);
              resolve(new Response(JSON.stringify(result)));
            })
          );
        }
      } else {
        const apiRateLimiterStub = env.RATE_LIMITER.get(
          env.RATE_LIMITER.idFromName(rateLimitKey)
        );
        if (rateLimit.type === RateLimiterTypes.TOKENS) {
          promises.push(
            apiRateLimiterStub.fetch('https://example.com', {
              method: 'POST',
              body: JSON.stringify({
                windowSize: RATE_LIMIT_UNIT_TO_WINDOW_MAPPING[rateLimit.unit],
                capacity: rateLimit.value,
                decrementTokens: false,
                units: maxTokens,
                keyType: keyType,
                key: key,
                rateLimitType: rateLimit.type,
              }),
            })
          );
        } else {
          promises.push(
            apiRateLimiterStub.fetch('https://example.com', {
              method: 'POST',
              body: JSON.stringify({
                windowSize: RATE_LIMIT_UNIT_TO_WINDOW_MAPPING[rateLimit.unit],
                capacity: rateLimit.value,
                decrementTokens: true,
                units: 1,
                keyType: keyType,
                key: key,
                rateLimitType: rateLimit.type,
              }),
            })
          );
        }
      }
    }
  }
  return promises;
}

export const decrementRateLimits = async (
  env: any,
  organisationId: string,
  rateLimitObject: RateLimit,
  cacheKey: string,
  type: RateLimiterKeyTypes,
  units: number
) => {
  if (getRuntimeKey() === 'node') {
    const redisClient = getDefaultCache().getClient() as RedisCacheBackend;
    if (!redisClient) {
      console.warn(
        'you need to set the REDIS_CONNECTION_STRING environment variable for rate limits to wrok'
      );
      return {
        allowed: true,
        waitTime: 0,
      };
    }
    const rateLimiter = new RedisRateLimiter(
      redisClient,
      rateLimitObject.value,
      RATE_LIMIT_UNIT_TO_WINDOW_MAPPING[rateLimitObject.unit],
      cacheKey,
      type
    );
    const resp = await rateLimiter.decrementToken(units);
    return {
      allowed: resp.allowed,
      waitTime: resp.waitTime,
    };
  }
  const apiRateLimiterStub = env.API_RATE_LIMITER.get(
    env.API_RATE_LIMITER.idFromName(cacheKey)
  );
  const apiRes = await apiRateLimiterStub.fetch(
    'https://api.portkey.ai/v1/health',
    {
      method: 'POST',
      body: JSON.stringify({
        windowSize: RATE_LIMIT_UNIT_TO_WINDOW_MAPPING[rateLimitObject.unit],
        capacity: rateLimitObject.value,
        units,
      }),
    }
  );

  const apiMillisecondsToNextRequest = await apiRes.json();

  if (apiMillisecondsToNextRequest > 0) {
    return {
      status: false,
      waitTime: apiMillisecondsToNextRequest,
    };
  }

  return {
    allowed: true,
    waitTime: apiMillisecondsToNextRequest,
  };
};

export const handleIntegrationTokenRateLimits = async (
  env: any,
  chLogObject: WinkyLogObject,
  units: number
) => {
  const organisationDetails = chLogObject.config.organisationDetails;
  const integrationDetails =
    chLogObject.config?.portkeyHeaders?.[HEADER_KEYS.INTEGRATION_DETAILS];
  if (!integrationDetails) {
    return;
  }
  const integrationDetailsObj =
    typeof integrationDetails === 'string'
      ? JSON.parse(integrationDetails)
      : integrationDetails;
  const rateLimits = integrationDetailsObj.rate_limits ?? [];
  const tokenRateLimits = rateLimits?.filter(
    (rl: any) => rl.type === RateLimiterTypes.TOKENS
  );
  for (const tokenRateLimit of tokenRateLimits) {
    const key = `${integrationDetailsObj.id}-${organisationDetails.workspaceDetails?.id}`;
    const rateLimitKey = generateRateLimitKey(
      organisationDetails.id,
      tokenRateLimit.type,
      RateLimiterKeyTypes.INTEGRATION_WORKSPACE,
      key,
      tokenRateLimit.unit
    );
    if (tokenRateLimit) {
      const vkRateLimits =
        typeof rateLimits === 'string' ? JSON.parse(rateLimits) : rateLimits;
      const requestsRateLimit = vkRateLimits?.filter(
        (rl: any) => rl.type === RateLimiterTypes.TOKENS
      )?.[0];
      const isCacheHit = [CACHE_STATUS.HIT, CACHE_STATUS.SEMANTIC_HIT].includes(
        chLogObject.config.cacheStatus
      );
      if (!isCacheHit && requestsRateLimit) {
        const virtualKey =
          chLogObject.config.portkeyHeaders?.[HEADER_KEYS.VIRTUAL_KEY];
        const requestRateLimitCheckObject = {
          value: virtualKey,
          rateLimits: requestsRateLimit,
        };
        await decrementRateLimits(
          env,
          chLogObject.config.organisationDetails.id,
          requestRateLimitCheckObject.rateLimits,
          rateLimitKey,
          RateLimiterKeyTypes.INTEGRATION_WORKSPACE,
          units
        );
      }
    }
  }
};
