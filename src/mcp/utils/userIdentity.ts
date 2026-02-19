/**
 * @file src/mcp/utils/userIdentity.ts
 * Utilities for building user identity headers to forward to upstream MCP servers
 */

import { SignJWT } from 'jose';
import { UserIdentityForwardingConfig } from '../types/mcp';
import { createLogger } from '../../shared/utils/logger';
import { Environment } from '../../utils/env';

// Import shared JWT utilities
import {
  TokenInfo,
  getPrivateKey as getPrivateKeyFromPem,
  getKeyId as getKeyIdFromPem,
  getPublicKeyJWK as getPublicKeyJWKFromPem,
  filterClaims,
  getClaimsCacheKey,
} from '../../shared/services/jwt';

// Re-export TokenInfo for backwards compatibility
export type { TokenInfo };

// Re-export filterClaims for backwards compatibility
export { filterClaims };

const logger = createLogger('mcp/userIdentity');

// ============================================================================
// Constants
// ============================================================================

/**
 * Default claims to include when forwarding user identity
 * These are the claims commonly available from Portkey OAuth tokens
 */
export const DEFAULT_CLAIMS = [
  'sub',
  'email',
  'username',
  'user_id',
  'workspace_id',
  'organisation_id',
  'scope',
  'client_id',
];

/**
 * Default header names for each forwarding method
 */
export const DEFAULT_HEADER_NAMES: Record<
  UserIdentityForwardingConfig['method'],
  string
> = {
  claims_header: 'X-User-Claims',
  bearer: 'Authorization',
  jwt_header: 'X-User-JWT',
};

/** Default JWT expiry in seconds (5 minutes) */
export const DEFAULT_JWT_EXPIRY_SECONDS = 300;

/** JWT Issuer */
export const JWT_ISSUER = 'portkey-mcp-gateway';

/**
 * Buffer time before JWT expiry to trigger re-signing (in seconds).
 * We re-sign 30 seconds before expiry to avoid edge cases.
 */
const JWT_REFRESH_BUFFER_SECONDS = 30;

// ============================================================================
// Private Key Wrappers (use shared key management with env)
// ============================================================================

/**
 * Get the JWT private key PEM from environment
 */
function getPrivateKeyPem(): string | undefined {
  const env = Environment({});
  return env.JWT_PRIVATE_KEY;
}

/**
 * Get the private key for JWT signing.
 * Wrapper around shared key management that uses environment variable.
 */
async function getPrivateKey(): Promise<CryptoKey | null> {
  return getPrivateKeyFromPem(getPrivateKeyPem());
}

/**
 * Get the key ID derived from the key's thumbprint (RFC 7638).
 * Wrapper around shared key management that uses environment variable.
 */
async function getKeyId(): Promise<string | null> {
  return getKeyIdFromPem(getPrivateKeyPem());
}

/**
 * Get the public key in JWK format for the JWKS endpoint.
 * Wrapper around shared key management that uses environment variable.
 *
 * @returns The public key as a JWK object, or null if not configured
 */
export async function getPublicKeyJWK() {
  return getPublicKeyJWKFromPem(getPrivateKeyPem());
}

// ============================================================================
// JWT Cache
// ============================================================================

/**
 * JWT cache entry
 */
interface JwtCacheEntry {
  jwt: string;
  expiresAt: number; // Unix timestamp in seconds
}

/**
 * Cache for signed JWTs, keyed by a hash of the claims.
 * This avoids expensive RSA signing on every request.
 */
const jwtCache = new Map<string, JwtCacheEntry>();

/** Maximum cache size to prevent memory bloat */
const JWT_CACHE_MAX_SIZE = 10000;

// ============================================================================
// Header Builders
// ============================================================================

/**
 * Serialize claims to JSON string, with error handling
 */
function serializeClaimsToJson(claims: Record<string, unknown>): string | null {
  try {
    return JSON.stringify(claims);
  } catch (error) {
    logger.error('Failed to serialize claims to JSON', error);
    return null;
  }
}

/**
 * Build claims header (JSON-encoded claims in a single header)
 */
export function buildClaimsHeader(
  config: UserIdentityForwardingConfig,
  tokenInfo: TokenInfo
): Record<string, string> {
  const headerName = config.header_name || DEFAULT_HEADER_NAMES.claims_header;
  const includeClaims = config.include_claims || DEFAULT_CLAIMS;

  const claims = filterClaims(tokenInfo, includeClaims);

  if (Object.keys(claims).length === 0) {
    logger.debug('No claims to forward, skipping claims header');
    return {};
  }

  const claimsJson = serializeClaimsToJson(claims);
  if (!claimsJson) return {};

  logger.debug(
    `Building claims header with ${Object.keys(claims).length} claims`
  );
  return { [headerName]: claimsJson };
}

/**
 * Build bearer header (forward the original OAuth token)
 */
export function buildBearerHeader(
  config: UserIdentityForwardingConfig,
  tokenInfo: TokenInfo
): Record<string, string> {
  const headerName = config.header_name || DEFAULT_HEADER_NAMES.bearer;

  if (!tokenInfo.token) {
    logger.debug('No token available for bearer forwarding');
    return {};
  }

  // Add 'Bearer ' prefix if not already present and header is Authorization
  const tokenValue =
    headerName.toLowerCase() === 'authorization' &&
    !tokenInfo.token.toLowerCase().startsWith('bearer ')
      ? `Bearer ${tokenInfo.token}`
      : tokenInfo.token;

  logger.debug('Building bearer header for token forwarding');
  return { [headerName]: tokenValue };
}

/**
 * Build JWT header (Portkey-signed JWT containing claims).
 * Uses caching to avoid expensive RSA signing on every request.
 */
export async function buildJwtHeader(
  config: UserIdentityForwardingConfig,
  tokenInfo: TokenInfo
): Promise<Record<string, string>> {
  const headerName = config.header_name || DEFAULT_HEADER_NAMES.jwt_header;
  const includeClaims = config.include_claims || DEFAULT_CLAIMS;
  const expirySeconds = config.jwt_expiry_seconds || DEFAULT_JWT_EXPIRY_SECONDS;

  const claims = filterClaims(tokenInfo, includeClaims);

  if (Object.keys(claims).length === 0) {
    logger.debug('No claims to forward, skipping JWT header');
    return {};
  }

  const privateKey = await getPrivateKey();

  // Fall back to unsigned JSON if no private key is configured
  if (!privateKey) {
    logger.debug('JWT signing key not available, using unsigned JSON claims');
    const claimsJson = serializeClaimsToJson(claims);
    return claimsJson ? { [headerName]: claimsJson } : {};
  }

  // Check cache for existing valid JWT
  const cacheKey = getClaimsCacheKey(claims);
  const now = Math.floor(Date.now() / 1000);
  const cached = jwtCache.get(cacheKey);

  if (cached && cached.expiresAt > now + JWT_REFRESH_BUFFER_SECONDS) {
    // Cache hit - return existing JWT
    logger.debug('Using cached JWT');
    return { [headerName]: cached.jwt };
  }

  // Cache miss or expired - sign a new JWT
  try {
    // Get key ID from thumbprint (RFC 7638)
    const kid = await getKeyId();

    const jwt = await new SignJWT(claims as Record<string, unknown>)
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: kid || undefined })
      .setIssuer(JWT_ISSUER)
      .setIssuedAt()
      .setExpirationTime(`${expirySeconds}s`)
      .sign(privateKey);

    // Cache the JWT
    const expiresAt = now + expirySeconds;

    // Evict oldest entries if cache is full (simple LRU-ish behavior)
    if (jwtCache.size >= JWT_CACHE_MAX_SIZE) {
      const firstKey = jwtCache.keys().next().value;
      if (firstKey) jwtCache.delete(firstKey);
    }

    jwtCache.set(cacheKey, { jwt, expiresAt });

    logger.debug(
      `Signed new JWT with ${Object.keys(claims).length} claims, expires in ${expirySeconds}s`
    );
    return { [headerName]: jwt };
  } catch (error) {
    logger.error('Failed to sign JWT, falling back to unsigned JSON', error);
    const claimsJson = serializeClaimsToJson(claims);
    return claimsJson ? { [headerName]: claimsJson } : {};
  }
}

// ============================================================================
// Main Entry Points
// ============================================================================

/**
 * Build user identity headers based on configuration.
 *
 * @param config - User identity forwarding configuration
 * @param tokenInfo - Token information containing user claims
 * @returns Headers to add to upstream requests
 */
export async function buildUserIdentityHeaders(
  config: UserIdentityForwardingConfig | undefined,
  tokenInfo: TokenInfo | undefined
): Promise<Record<string, string>> {
  if (!config) {
    return {};
  }

  if (!tokenInfo) {
    logger.debug('No tokenInfo available, skipping user identity forwarding');
    return {};
  }

  switch (config.method) {
    case 'claims_header':
      return buildClaimsHeader(config, tokenInfo);

    case 'bearer':
      return buildBearerHeader(config, tokenInfo);

    case 'jwt_header':
      return buildJwtHeader(config, tokenInfo);

    default:
      logger.warn(`Unknown user identity forwarding method: ${config.method}`);
      return {};
  }
}
