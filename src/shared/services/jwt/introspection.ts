/**
 * @file src/shared/services/jwt/introspection.ts
 * Token introspection endpoint validation (RFC 7662)
 */

import { JwtValidationConfig } from './types';
import { hashToken, checkTokenExpiry } from './claims';
import { requestCache } from '../../../services/cache/cacheService';
import { createLogger } from '../../utils/logger';
import { externalServiceFetch } from '../../../utils/fetch';

const logger = createLogger('shared/jwt/introspection');

/** Cache key prefix for introspection results */
const INTROSPECT_PREFIX = 'introspect:';

/** JWT cache namespace */
const JWT_NAMESPACE = 'jwt';

/**
 * Response from token introspection endpoint
 */
interface IntrospectionResponse {
  active: boolean;
  [key: string]: unknown;
}

/**
 * Validate token via introspection endpoint (RFC 7662)
 *
 * @param token - JWT token string
 * @param config - JWT validation configuration
 * @returns Validation result with payload
 */
export async function validateViaIntrospection(
  token: string,
  config: JwtValidationConfig
): Promise<{
  valid: boolean;
  payload?: Record<string, unknown>;
  error?: string;
}> {
  if (!config.introspectEndpoint) {
    return { valid: false, error: 'No introspection endpoint configured' };
  }

  const cache = requestCache();
  const clockTolerance = config.clockTolerance ?? 5;

  // Check cache first
  if (config.introspectCacheMaxAge) {
    const cacheKey = `${INTROSPECT_PREFIX}${hashToken(token)}`;
    const cached = await cache.get<{
      payload: Record<string, unknown>;
      exp?: number;
    }>(cacheKey, { namespace: JWT_NAMESPACE });

    if (cached) {
      // Verify cached token hasn't expired (with clock tolerance)
      if (cached.exp) {
        const now = Math.floor(Date.now() / 1000);
        if (cached.exp + clockTolerance <= now) {
          // Token expired since caching, don't use cached result
          logger.debug('Cached introspection result expired');
        } else {
          logger.debug('Using cached introspection result');
          return { valid: true, payload: cached.payload };
        }
      } else {
        // No exp claim, trust the cached result
        return { valid: true, payload: cached.payload };
      }
    }
  }

  // Call introspection endpoint
  try {
    // RFC 7662 specifies application/x-www-form-urlencoded as the standard format
    const contentType =
      config.introspectContentType || 'application/x-www-form-urlencoded';

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': contentType,
    };

    // Add client authentication via HTTP Basic Auth if credentials provided
    if (config.introspectClientId && config.introspectClientSecret) {
      const credentials = Buffer.from(
        `${config.introspectClientId}:${config.introspectClientSecret}`
      ).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    }

    // Format body based on content type
    let body: string;
    if (contentType === 'application/x-www-form-urlencoded') {
      // RFC 7662 compliant format
      const params = new URLSearchParams();
      params.set('token', token);
      // Include client_id in body if no secret (public client)
      if (config.introspectClientId && !config.introspectClientSecret) {
        params.set('client_id', config.introspectClientId);
      }
      body = params.toString();
    } else {
      // JSON format for endpoints that support it
      const jsonBody: Record<string, string> = { token };
      if (config.introspectClientId && !config.introspectClientSecret) {
        jsonBody.client_id = config.introspectClientId;
      }
      body = JSON.stringify(jsonBody);
    }

    const response = await externalServiceFetch(config.introspectEndpoint, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      return {
        valid: false,
        error: `Introspection endpoint returned ${response.status}`,
      };
    }

    const data = (await response.json()) as IntrospectionResponse;

    // RFC 7662 requires the "active" boolean field in the response
    if (typeof data.active !== 'boolean') {
      return {
        valid: false,
        error:
          "Introspection response missing required 'active' field (RFC 7662)",
      };
    }

    if (!data.active) {
      return { valid: false, error: 'Token is not active' };
    }

    const payload = data as Record<string, unknown>;

    // Validate time-based claims (with clock tolerance)
    const expiryCheck = checkTokenExpiry(payload, clockTolerance);
    if (expiryCheck.expired) {
      return { valid: false, error: expiryCheck.error };
    }

    // Cache the result if caching is enabled
    if (config.introspectCacheMaxAge) {
      let cacheTTLSeconds = config.introspectCacheMaxAge;
      const now = Math.floor(Date.now() / 1000);

      // Ensure cache TTL doesn't exceed token expiration
      if (payload.exp) {
        const exp = Number(payload.exp);
        if (!isNaN(exp)) {
          const timeUntilExpiry = exp + clockTolerance - now;
          if (timeUntilExpiry > 0) {
            cacheTTLSeconds = Math.min(cacheTTLSeconds, timeUntilExpiry);
          } else {
            // Token already expired, don't cache
            cacheTTLSeconds = 0;
          }
        }
      }

      if (cacheTTLSeconds > 0) {
        const cacheKey = `${INTROSPECT_PREFIX}${hashToken(token)}`;
        await cache.set(
          cacheKey,
          { payload, exp: payload.exp as number | undefined },
          { ttl: cacheTTLSeconds * 1000, namespace: JWT_NAMESPACE } // Convert to milliseconds
        );
      }
    }

    return { valid: true, payload };
  } catch (error) {
    logger.error('Token introspection failed', error);
    return {
      valid: false,
      error: `Introspection error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
