/**
 * @file src/shared/services/jwt/keys.ts
 * Private/public key management for JWT signing
 * Includes CryptoKey caching for performance
 */

import { importPKCS8, exportJWK, calculateJwkThumbprint, JWK } from 'jose';
import { createLogger } from '../../utils/logger';

const logger = createLogger('shared/jwt/keys');

// ============================================================================
// Private Key Management (cached)
// ============================================================================

/** Cached private key for JWT signing */
let cachedPrivateKey: CryptoKey | null = null;

/** Cached public JWK for JWKS endpoint */
let cachedPublicJwk: JWK | null = null;

/** Cached key ID derived from key thumbprint (best practice per RFC 7638) */
let cachedKeyId: string | null = null;

/** Tracks if we've already logged the "not configured" warning */
let hasLoggedKeyNotConfigured = false;

/** Error from key import (cached to avoid repeated attempts) */
let privateKeyError: Error | null = null;

/**
 * Get the private key for JWT signing.
 * Caches the key after first successful import.
 *
 * @param privateKeyPem - PEM-encoded private key (typically from JWT_PRIVATE_KEY env var)
 * @returns The imported CryptoKey or null if not available
 */
export async function getPrivateKey(
  privateKeyPem: string | undefined
): Promise<CryptoKey | null> {
  if (cachedPrivateKey) return cachedPrivateKey;
  if (privateKeyError) return null;

  if (!privateKeyPem) {
    if (!hasLoggedKeyNotConfigured) {
      logger.warn('JWT private key not provided. JWT signing is disabled.');
      hasLoggedKeyNotConfigured = true;
    }
    privateKeyError = new Error('JWT private key not configured');
    return null;
  }

  try {
    // extractable: true allows us to export the public key for the JWKS endpoint
    cachedPrivateKey = await importPKCS8(privateKeyPem, 'RS256', {
      extractable: true,
    });
    logger.info('Successfully loaded JWT signing key');
    return cachedPrivateKey;
  } catch (error) {
    logger.error('Failed to import JWT private key', error);
    privateKeyError = error as Error;
    return null;
  }
}

/**
 * Get the key ID derived from the key's thumbprint (RFC 7638).
 * This is the best practice for generating stable, verifiable key IDs.
 *
 * @param privateKeyPem - PEM-encoded private key
 * @returns The key ID (SHA-256 thumbprint) or null if key not available
 */
export async function getKeyId(
  privateKeyPem: string | undefined
): Promise<string | null> {
  if (cachedKeyId) return cachedKeyId;

  const privateKey = await getPrivateKey(privateKeyPem);
  if (!privateKey) return null;

  try {
    const jwk = await exportJWK(privateKey);
    // Remove private components for thumbprint calculation
    const { d, p, q, dp, dq, qi, ...publicJwk } = jwk as Record<
      string,
      unknown
    >;
    // SHA-256 thumbprint of the public key (RFC 7638)
    cachedKeyId = await calculateJwkThumbprint(publicJwk as JWK, 'sha256');
    return cachedKeyId;
  } catch (error) {
    logger.error('Failed to calculate key thumbprint', error);
    return null;
  }
}

/**
 * Get the public key in JWK format for the JWKS endpoint.
 * Caches the JWK after first successful export.
 * Key ID is derived from the key's thumbprint per RFC 7638.
 *
 * @param privateKeyPem - PEM-encoded private key
 * @returns The public key as a JWK object, or null if not configured
 */
export async function getPublicKeyJWK(
  privateKeyPem: string | undefined
): Promise<JWK | null> {
  // Return cached JWK if available
  if (cachedPublicJwk) return cachedPublicJwk;

  const privateKey = await getPrivateKey(privateKeyPem);
  if (!privateKey) return null;

  try {
    const jwk = await exportJWK(privateKey);
    // Remove private key components, keep only public parts
    const { d, p, q, dp, dq, qi, ...publicJwk } = jwk as Record<
      string,
      unknown
    >;

    // Get key ID from thumbprint
    const kid = await getKeyId(privateKeyPem);

    cachedPublicJwk = {
      ...publicJwk,
      kid: kid || undefined,
      use: 'sig',
      alg: 'RS256',
    } as JWK;

    return cachedPublicJwk;
  } catch (error) {
    logger.error('Failed to export public key as JWK', error);
    return null;
  }
}

/**
 * Clear all cached keys (useful for testing or key rotation)
 */
export function clearKeyCache(): void {
  cachedPrivateKey = null;
  cachedPublicJwk = null;
  cachedKeyId = null;
  privateKeyError = null;
  hasLoggedKeyNotConfigured = false;
}
