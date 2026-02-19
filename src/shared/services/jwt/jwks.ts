/**
 * @file src/shared/services/jwt/jwks.ts
 * JWKS fetching, caching, and JWT signature validation
 */

import {
  jwtVerify,
  importJWK,
  JWK,
  decodeJwt,
  decodeProtectedHeader,
  ProtectedHeaderParameters,
} from 'jose';
import { JwtValidationConfig } from './types';
import { checkTokenExpiry } from './claims';
import { requestCache } from '../../../services/cache/cacheService';
import { createLogger } from '../../utils/logger';

// JWT cache namespace
const JWT_NAMESPACE = 'jwt';

const logger = createLogger('shared/jwt/jwks');

/** Cache key prefixes */
const CRYPTOKEY_PREFIX = 'cryptokey:';
const JWKS_PREFIX = 'jwks:';

/** TTL for CryptoKeys - long lived since keys rarely change */
const CRYPTOKEY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get a cached CryptoKey or import and cache a new one
 */
async function getCachedCryptoKey(
  kid: string,
  jwk: JWK,
  algorithm: string
): Promise<CryptoKey> {
  const cache = requestCache();
  const cacheKey = `${CRYPTOKEY_PREFIX}${kid}:${algorithm}`;

  const cached = await cache.get<CryptoKey>(cacheKey, {
    namespace: JWT_NAMESPACE,
  });
  if (cached) {
    return cached;
  }

  const key = await importJWK(jwk, algorithm);

  // Cache with long TTL (keys rarely change)
  await cache.set(cacheKey, key as CryptoKey, {
    ttl: CRYPTOKEY_TTL_MS,
    namespace: JWT_NAMESPACE,
  });

  return key as CryptoKey;
}

// ============================================================================
// JWKS Fetching
// ============================================================================

/**
 * Fetch JWKS from URI with caching
 */
export async function fetchJwks(
  jwksUri: string,
  maxAgeSeconds: number = 86400
): Promise<{ keys: JWK[] }> {
  const cache = requestCache();
  const cacheKey = `${JWKS_PREFIX}${jwksUri}`;

  // Try cache first
  const cached = await cache.get<{ keys: JWK[] }>(cacheKey, {
    namespace: JWT_NAMESPACE,
  });
  if (cached) {
    logger.debug(`JWKS cache hit for ${jwksUri}`);
    return cached;
  }

  // Fetch from URI
  logger.debug(`Fetching JWKS from ${jwksUri}`);
  const response = await fetch(jwksUri);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch JWKS: ${response.status} ${response.statusText}`
    );
  }

  const jwks = (await response.json()) as { keys: JWK[] };

  // Cache the result
  await cache.set(cacheKey, jwks, {
    ttl: maxAgeSeconds * 1000,
    namespace: JWT_NAMESPACE,
  });

  return jwks;
}

/**
 * Find matching key from JWKS by kid
 */
export async function getMatchingKey(
  header: ProtectedHeaderParameters,
  jwks: { keys?: JWK[] },
  defaultAlgorithm: string
): Promise<CryptoKey | null> {
  if (!header.kid) {
    logger.debug('No kid in JWT header, cannot find matching key');
    return null;
  }

  const jwk = (jwks.keys || []).find((key: JWK) => key.kid === header.kid);
  if (!jwk) {
    logger.debug(`No key found for kid: ${header.kid}`);
    return null;
  }

  const algorithm = jwk.alg || defaultAlgorithm;
  return getCachedCryptoKey(header.kid, jwk, algorithm);
}

// ============================================================================
// JWT Validation with JWKS
// ============================================================================

/**
 * Validate JWT using JWKS (inline or URI)
 *
 * @param token - JWT token string
 * @param config - JWT validation configuration
 * @returns Decoded payload and header
 */
export async function validateWithJwks(
  token: string,
  config: JwtValidationConfig
): Promise<{
  payload: Record<string, unknown>;
  header: ProtectedHeaderParameters;
}> {
  const cache = requestCache();

  // Decode without verification first (for fail-fast checks)
  const payload = decodeJwt(token);
  const header = decodeProtectedHeader(token);

  const algorithms = config.algorithms || ['RS256'];
  const clockTolerance = config.clockTolerance ?? 5;
  const cacheMaxAge = config.cacheMaxAge ?? 86400;

  // Fail-fast: check expiry before expensive crypto operations
  const expiryCheck = checkTokenExpiry(
    payload as Record<string, unknown>,
    clockTolerance
  );
  if (expiryCheck.expired) {
    throw new Error(expiryCheck.error);
  }

  // Get JWKS (inline or fetch from URI)
  let jwks = config.jwks;
  if (!jwks && config.jwksUri) {
    jwks = await fetchJwks(config.jwksUri, cacheMaxAge);
  }

  if (!jwks) {
    throw new Error('No JWKS available for validation');
  }

  // Find matching key
  let key = await getMatchingKey(header, jwks, algorithms[0]);

  // If no key found and using URI, try refetching (key rotation scenario)
  if (!key && config.jwksUri) {
    logger.debug(
      'No matching key found, refetching JWKS for potential key rotation'
    );
    // Force refresh
    const response = await fetch(config.jwksUri);
    if (response.ok) {
      jwks = (await response.json()) as { keys: JWK[] };
      // Update cache with fresh JWKS
      await cache.set(`${JWKS_PREFIX}${config.jwksUri}`, jwks, {
        ttl: cacheMaxAge * 1000,
        namespace: JWT_NAMESPACE,
      });
      key = await getMatchingKey(header, jwks, algorithms[0]);
    }
  }

  if (!key) {
    throw new Error(`No matching key found for kid: ${header.kid}`);
  }

  // Verify signature
  const verifyOptions: Record<string, unknown> = {
    clockTolerance,
    algorithms,
  };

  if (config.maxTokenAge && payload.iat) {
    verifyOptions.maxTokenAge = config.maxTokenAge;
  }

  await jwtVerify(token, key, verifyOptions);

  return { payload: payload as Record<string, unknown>, header };
}

/**
 * Clear the CryptoKey cache (useful for testing or key rotation)
 * Note: This is a no-op as the new cache service doesn't support pattern-based clearing
 */
export async function clearCryptoKeyCache(): Promise<void> {
  // The new cache service doesn't support pattern-based clearing
  // Keys will expire naturally based on TTL
  logger.debug('clearCryptoKeyCache called - keys will expire based on TTL');
}
