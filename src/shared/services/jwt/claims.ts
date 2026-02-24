/**
 * @file src/shared/services/jwt/claims.ts
 * JWT claim filtering, extraction, and validation utilities
 */

import { ProtectedHeaderParameters } from 'jose';
import { TokenInfo, ClaimValueConfig, ClaimValidationResult } from './types';

// ============================================================================
// Shared Utilities
// ============================================================================

/**
 * Simple hash function for token (for cache key).
 * Uses a basic string hash - not cryptographically secure but fast.
 *
 * @param token - Token string to hash
 * @returns Hash string in base36
 */
export function hashToken(token: string): string {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

/**
 * Check if a token has expired based on exp claim.
 *
 * @param payload - JWT payload containing exp claim
 * @param clockTolerance - Clock skew tolerance in seconds (default: 5)
 * @returns Object with expired flag and error message if expired
 */
export function checkTokenExpiry(
  payload: Record<string, unknown>,
  clockTolerance: number = 5
): { expired: boolean; error?: string } {
  const now = Math.floor(Date.now() / 1000);

  // Check expiration
  if (payload.exp) {
    const exp = Number(payload.exp);
    if (!isNaN(exp) && exp + clockTolerance <= now) {
      return { expired: true, error: 'Token has expired' };
    }
  }

  // Check not-before
  if (payload.nbf) {
    const nbf = Number(payload.nbf);
    if (!isNaN(nbf) && nbf - clockTolerance > now) {
      return { expired: true, error: 'Token not yet valid' };
    }
  }

  return { expired: false };
}

// ============================================================================
// Claim Filtering (for identity forwarding)
// ============================================================================

/**
 * Filter claims from tokenInfo based on the include_claims list
 *
 * @param tokenInfo - Token information containing user claims
 * @param includeClaims - Array of claim names to include
 * @returns Filtered claims object
 */
export function filterClaims(
  tokenInfo: TokenInfo,
  includeClaims: string[]
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};

  for (const claim of includeClaims) {
    if (claim in tokenInfo && tokenInfo[claim] !== undefined) {
      filtered[claim] = tokenInfo[claim];
    }
  }

  return filtered;
}

/**
 * Generate a cache key from claims.
 * Uses a simple string concatenation of sorted key-value pairs.
 *
 * @param claims - Claims object to generate cache key from
 * @returns Cache key string
 */
export function getClaimsCacheKey(claims: Record<string, unknown>): string {
  const sortedKeys = Object.keys(claims).sort();
  return sortedKeys.map((k) => `${k}:${String(claims[k])}`).join('|');
}

// ============================================================================
// Claim Validation
// ============================================================================

/**
 * Normalize value to array for comparison.
 * Special handling for OAuth 'scope' claim (RFC 6749 space-separated).
 */
function normalizeToArray(value: unknown, claimName?: string): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v));
  }
  if (typeof value === 'string') {
    // Only split by spaces for OAuth 'scope' claim (RFC 6749)
    if (claimName?.toLowerCase() === 'scope') {
      return value.split(/\s+/).filter((v) => v.length > 0);
    }
    return [value];
  }
  return [String(value)];
}

/**
 * Validate required claims are present in the payload
 */
export function validateRequiredClaims(
  payload: Record<string, unknown>,
  requiredClaims: string[]
): ClaimValidationResult {
  const missing: string[] = [];

  for (const claim of requiredClaims) {
    if (
      !(claim in payload) ||
      payload[claim] === undefined ||
      payload[claim] === null
    ) {
      missing.push(claim);
    }
  }

  return {
    valid: missing.length === 0,
    missing: missing.length > 0 ? missing : undefined,
  };
}

/**
 * Validate claim values match expected values
 */
export function validateClaimValues(
  payload: Record<string, unknown>,
  claimValues: Record<string, ClaimValueConfig>
): ClaimValidationResult {
  const failed: string[] = [];

  for (const [claimName, config] of Object.entries(claimValues)) {
    const payloadValue = payload[claimName];

    if (payloadValue === undefined || payloadValue === null) {
      failed.push(`${claimName} (missing)`);
      continue;
    }

    const expectedValues = Array.isArray(config.values)
      ? config.values
      : [config.values];
    const matchType = config.matchType || 'exact';
    let matches = false;

    switch (matchType) {
      case 'exact': {
        const normalized = normalizeToArray(payloadValue, claimName);
        // Exact match requires single values on both sides
        if (normalized.length !== 1) {
          failed.push(
            `${claimName} (exact match requires single value, got ${normalized.length})`
          );
          continue;
        }
        if (expectedValues.length !== 1) {
          failed.push(
            `${claimName} (exact match config requires single value, got ${expectedValues.length})`
          );
          continue;
        }
        matches = normalized[0] === String(expectedValues[0]);
        break;
      }

      case 'contains': {
        // Check if payload contains at least one of the expected values (OR logic)
        // Uses exact element matching, not substring matching
        const payloadArray = normalizeToArray(payloadValue, claimName);
        matches = expectedValues.some((expected) =>
          payloadArray.includes(String(expected))
        );
        break;
      }

      case 'containsAll': {
        // Check if payload contains ALL of the expected values (AND logic)
        // Uses exact element matching, not substring matching
        const payloadArray = normalizeToArray(payloadValue, claimName);
        matches = expectedValues.every((expected) =>
          payloadArray.includes(String(expected))
        );
        break;
      }

      case 'regex': {
        matches = expectedValues.some((pattern) => {
          try {
            const regex = new RegExp(pattern);
            const values = normalizeToArray(payloadValue, claimName);
            return values.some((val) => regex.test(val));
          } catch {
            return false;
          }
        });
        break;
      }
    }

    if (!matches) {
      failed.push(claimName);
    }
  }

  return {
    valid: failed.length === 0,
    failed: failed.length > 0 ? failed : undefined,
  };
}

/**
 * Validate header values match payload values
 */
export function validateHeaderPayloadMatch(
  header: ProtectedHeaderParameters,
  payload: Record<string, unknown>,
  keysToMatch: string[]
): ClaimValidationResult {
  const mismatched: string[] = [];

  for (const key of keysToMatch) {
    const headerValue = (header as Record<string, unknown>)[key];
    const payloadValue = payload[key];

    if (headerValue !== payloadValue) {
      mismatched.push(key);
    }
  }

  return {
    valid: mismatched.length === 0,
    mismatched: mismatched.length > 0 ? mismatched : undefined,
  };
}
