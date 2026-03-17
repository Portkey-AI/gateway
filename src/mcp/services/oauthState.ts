/**
 * OAuth State Token Management
 *
 * Handles secure state token creation and validation for OAuth flows.
 * Uses nonce-based approach to avoid exposing API keys in OAuth state.
 *
 * Flow:
 * 1. Create state: Generate nonce → store {apiKey, serverUrl} in cache → return signed token
 * 2. Validate state: Verify signature → extract nonce → lookup data from cache
 */

import crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { getCache } from '../utils/cache.js';

const log = logger.child('oauthState');

// State token TTL (10 minutes - enough time for OAuth flow)
const STATE_TTL_SECONDS = 600;

// Get signing secret from environment
const getSigningSecret = (): string => {
  const secret = process.env.MCP_SESSION_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('MCP_SESSION_SECRET environment variable is required for OAuth state signing');
  }
  return secret;
};

interface OAuthStateCacheEntry {
  apiKey: string;
  serverUrl: string;
  createdAt: number;
}

interface OAuthStatePayload {
  nonce: string;
  timestamp: number;
}

/**
 * Generate a cryptographically secure nonce
 */
function generateNonce(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Create HMAC signature for state payload
 */
function signPayload(payload: OAuthStatePayload): string {
  const secret = getSigningSecret();
  const data = JSON.stringify(payload);
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

/**
 * Verify HMAC signature
 */
function verifySignature(payload: OAuthStatePayload, signature: string): boolean {
  const expectedSignature = signPayload(payload);

  // Use timing-safe comparison
  const sigBuffer = Buffer.from(signature, 'base64url');
  const expectedBuffer = Buffer.from(expectedSignature, 'base64url');

  if (sigBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    new Uint8Array(sigBuffer),
    new Uint8Array(expectedBuffer)
  );
}

/**
 * Create a secure OAuth state token
 *
 * @param apiKey - The API key for token storage
 * @param serverUrl - The MCP server URL
 * @returns State token string to use in OAuth flow
 */
export async function createOAuthState(apiKey: string, serverUrl: string): Promise<string> {
  const cache = getCache();
  const nonce = generateNonce();
  const timestamp = Date.now();

  // Store mapping in cache
  const cacheKey = `oauth_state:${nonce}`;
  const cacheEntry: OAuthStateCacheEntry = {
    apiKey,
    serverUrl,
    createdAt: timestamp,
  };

  await cache.setOAuthState(cacheKey, cacheEntry, STATE_TTL_SECONDS);

  // Create signed token
  const payload: OAuthStatePayload = { nonce, timestamp };
  const signature = signPayload(payload);

  // Encode as: base64url(payload).signature
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const stateToken = `${encodedPayload}.${signature}`;

  log.debug('Created OAuth state', { nonce: nonce.substring(0, 8) + '...' });

  return stateToken;
}

/**
 * Validate and parse OAuth state token
 *
 * @param stateToken - The state token from OAuth callback
 * @returns Parsed payload if valid, null otherwise
 */
export function validateOAuthStateToken(stateToken: string): OAuthStatePayload | null {
  try {
    const [encodedPayload, signature] = stateToken.split('.');

    if (!encodedPayload || !signature) {
      log.warn('Invalid state token format');
      return null;
    }

    // Decode payload
    const payloadJson = Buffer.from(encodedPayload, 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadJson) as OAuthStatePayload;

    // Verify signature
    if (!verifySignature(payload, signature)) {
      log.warn('Invalid state token signature');
      return null;
    }

    // Check timestamp (allow 10 minute window)
    const age = Date.now() - payload.timestamp;
    if (age > STATE_TTL_SECONDS * 1000) {
      log.warn('State token expired', { age: Math.round(age / 1000) + 's' });
      return null;
    }

    return payload;
  } catch (error) {
    log.error('Error validating state token', { error });
    return null;
  }
}

/**
 * Get OAuth state data from cache using nonce
 *
 * @param nonce - The nonce from validated state token
 * @returns Cached state data if found
 */
export async function getOAuthStateData(nonce: string): Promise<OAuthStateCacheEntry | null> {
  const cache = getCache();
  const cacheKey = `oauth_state:${nonce}`;

  const data = await cache.getOAuthState<OAuthStateCacheEntry>(cacheKey);

  if (!data) {
    log.warn('OAuth state not found in cache', { nonce: nonce.substring(0, 8) + '...' });
    return null;
  }

  return data;
}

/**
 * Delete OAuth state from cache (cleanup after use)
 *
 * @param nonce - The nonce to delete
 */
export async function deleteOAuthState(nonce: string): Promise<void> {
  const cache = getCache();
  const cacheKey = `oauth_state:${nonce}`;
  await cache.deleteOAuthState(cacheKey);
}

/**
 * Generate cache key for OAuth tokens
 * Uses hash of API key + normalized server URL
 *
 * @param apiKey - The API key
 * @param serverUrl - The MCP server URL
 * @returns Cache key string
 */
export function generateTokenCacheKey(apiKey: string, serverUrl: string): string {
  const normalizedUrl = normalizeServerUrl(serverUrl);
  const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex').substring(0, 16);
  return `${apiKeyHash}::${normalizedUrl}`;
}

/**
 * Hash API key for identification (logs, cache keys, etc.)
 * Returns a truncated SHA256 hash
 */
export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex').substring(0, 16);
}

/**
 * Normalize server URL for consistent cache keys
 * Removes trailing slashes, lowercases hostname
 */
export function normalizeServerUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Lowercase hostname, keep path, remove trailing slash
    let normalized = `${parsed.protocol}//${parsed.hostname.toLowerCase()}`;
    if (parsed.port) {
      normalized += `:${parsed.port}`;
    }
    normalized += parsed.pathname.replace(/\/+$/, '') || '/';
    return normalized;
  } catch {
    // If URL parsing fails, just normalize basic characters
    return url.toLowerCase().replace(/\/+$/, '');
  }
}
