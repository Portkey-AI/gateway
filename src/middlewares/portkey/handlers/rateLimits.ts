import { requestCache } from '../../../services/cache/cacheService';
import { RATE_LIMIT_UNIT_TO_WINDOW_MAPPING } from '../../../globals';
import { RateLimiterKeyTypes, RateLimiterTypes } from '../globals';
import { RateLimit } from '../types';

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
  const cache = requestCache(env);
  const promises: Promise<{
    keyType: RateLimiterKeyTypes;
    key: string;
    allowed: boolean;
    waitTime: number;
    availableTokens: number;
  }>[] = [];

  for (const rateLimit of rateLimits) {
    if (rateLimit.unit && rateLimit.value) {
      const rateLimitKey = generateRateLimitKey(
        organisationId,
        rateLimit.type,
        keyType,
        key,
        rateLimit.unit
      );

      const windowSize = RATE_LIMIT_UNIT_TO_WINDOW_MAPPING[rateLimit.unit];
      const units = rateLimit.type === RateLimiterTypes.TOKENS ? maxTokens : 1;
      // For token-based limits, only check availability (don't consume yet)
      // For request-based limits, consume immediately
      const consume = rateLimit.type !== RateLimiterTypes.TOKENS;

      promises.push(
        cache
          .checkRateLimit(
            rateLimitKey,
            rateLimit.value,
            windowSize,
            units,
            consume
          )
          .then((result) => ({
            keyType,
            key: rateLimitKey,
            allowed: result.allowed,
            waitTime: result.waitTime,
            availableTokens: result.availableTokens,
          }))
      );
    }
  }
  return promises;
}

export async function postRequestRateLimitValidator({
  env,
  rateLimits,
  key,
  keyType,
  tokenToDecr,
  organisationId,
}: {
  env: Record<string, any>;
  rateLimits: RateLimit[];
  key: string;
  keyType: RateLimiterKeyTypes;
  tokenToDecr: number;
  organisationId: string;
}) {
  if (!rateLimits || !rateLimits.length || !tokenToDecr) {
    return;
  }

  const tokenRateLimit = rateLimits?.find(
    (rl) => rl.type === RateLimiterTypes.TOKENS
  );
  if (tokenRateLimit?.value && tokenRateLimit.value > 0 && tokenToDecr) {
    const cache = requestCache(env);
    const rateLimitKey = generateRateLimitKey(
      organisationId,
      tokenRateLimit.type,
      keyType,
      key,
      tokenRateLimit.unit
    );
    const windowSize = RATE_LIMIT_UNIT_TO_WINDOW_MAPPING[tokenRateLimit.unit];

    // Consume the actual tokens used
    return cache.checkRateLimit(
      rateLimitKey,
      tokenRateLimit.value,
      windowSize,
      tokenToDecr,
      true // consume tokens
    );
  }
}
