/**
 * @file src/shared/services/jwt/validator.ts
 * Main JWT validation orchestrator with caching and fail-fast optimizations
 */

import {
  decodeJwt,
  decodeProtectedHeader,
  ProtectedHeaderParameters,
} from 'jose';
import {
  JwtValidationConfig,
  ValidationResult,
  ValidationDetails,
} from './types';
import { validateWithJwks } from './jwks';
import { validateViaIntrospection } from './introspection';
import {
  validateRequiredClaims,
  validateClaimValues,
  validateHeaderPayloadMatch,
  hashToken,
  checkTokenExpiry,
} from './claims';
import { requestCache } from '../../../services/cache/cacheService';
import { createLogger } from '../../utils/logger';

const logger = createLogger('shared/jwt/validator');

/** Cache key prefix for validated tokens */
const VALIDATED_TOKEN_PREFIX = 'validated:';

/** JWT cache namespace */
const JWT_NAMESPACE = 'jwt';

// ============================================================================
// Main Validator
// ============================================================================

/**
 * Validate a JWT token using the configured method (JWKS or introspection)
 *
 * Features:
 * - Caches validated tokens to avoid repeated crypto operations
 * - Fail-fast: checks expiry before expensive signature verification
 * - Supports JWKS (inline or URI) and token introspection
 * - Validates required claims and claim values
 *
 * @param token - JWT token string (without Bearer prefix)
 * @param config - JWT validation configuration
 * @returns Validation result with payload if valid
 */
export async function validateJwt(
  token: string,
  config: JwtValidationConfig
): Promise<ValidationResult> {
  try {
    const cache = requestCache();

    // Validate we have at least one validation method
    if (!config.jwks && !config.jwksUri && !config.introspectEndpoint) {
      return {
        valid: false,
        error:
          'No validation method configured (jwks, jwksUri, or introspectEndpoint required)',
      };
    }

    const clockTolerance = config.clockTolerance ?? 5;
    const tokenHash = hashToken(token);
    const cacheKey = `${VALIDATED_TOKEN_PREFIX}${tokenHash}`;

    // Fast path: check cache for previously validated token
    const cached = await cache.get<{
      payload: Record<string, unknown>;
      exp?: number;
    }>(cacheKey, { namespace: JWT_NAMESPACE });
    if (cached) {
      const now = Math.floor(Date.now() / 1000);
      if (!cached.exp || cached.exp + clockTolerance > now) {
        logger.debug('Using cached validated token');
        return {
          valid: true,
          payload: cached.payload,
          validations: { signatureValid: true },
        };
      }
      // Token expired - cache service handles cleanup automatically
    }

    // Try to decode as JWT - this may fail for opaque tokens
    let payload: Record<string, unknown> | undefined;
    let header: ProtectedHeaderParameters | undefined;
    let isOpaqueToken = false;

    try {
      payload = decodeJwt(token) as Record<string, unknown>;
      header = decodeProtectedHeader(token);
    } catch (decodeError) {
      // Token is not a valid JWT format
      // This is only acceptable if introspection is configured (opaque token support)
      if (config.introspectEndpoint) {
        logger.debug(
          'Token is not a valid JWT, will validate via introspection (opaque token)'
        );
        isOpaqueToken = true;
      } else {
        return {
          valid: false,
          error: `Invalid JWT format: ${decodeError instanceof Error ? decodeError.message : String(decodeError)}`,
        };
      }
    }

    // For valid JWTs (not opaque tokens), do fail-fast checks
    if (!isOpaqueToken && payload) {
      // Fail-fast: check expiry before crypto (for JWKS validation)
      if (!config.introspectEndpoint) {
        const expiryCheck = checkTokenExpiry(payload, clockTolerance);
        if (expiryCheck.expired) {
          return { valid: false, error: expiryCheck.error };
        }
      }

      // Fail-fast: check required claims before crypto
      if (config.requiredClaims) {
        const reqResult = validateRequiredClaims(
          payload,
          config.requiredClaims
        );
        if (!reqResult.valid) {
          return {
            valid: false,
            error: `Missing required claims: ${reqResult.missing?.join(', ')}`,
            validations: {
              signatureValid: false,
              requiredClaims: reqResult,
            },
          };
        }
      }
    }

    // Step 1: Validate token signature/authenticity
    if (config.introspectEndpoint) {
      const result = await validateViaIntrospection(token, config);
      if (!result.valid) {
        return {
          valid: false,
          error: result.error,
          validations: { signatureValid: false },
        };
      }
      // Use payload from introspection response
      payload = result.payload!;
    } else {
      const result = await validateWithJwks(token, config);
      payload = result.payload;
      header = result.header;
    }

    // Step 2: Validate claims
    const validations: ValidationDetails = {
      signatureValid: true,
    };
    const failedValidations: string[] = [];

    if (config.requiredClaims) {
      validations.requiredClaims = validateRequiredClaims(
        payload,
        config.requiredClaims
      );
      if (!validations.requiredClaims.valid) {
        failedValidations.push(
          `Missing claims: ${validations.requiredClaims.missing?.join(', ')}`
        );
      }
    }

    if (config.claimValues) {
      validations.claimValues = validateClaimValues(
        payload,
        config.claimValues
      );
      if (!validations.claimValues.valid) {
        failedValidations.push(
          `Invalid claims: ${validations.claimValues.failed?.join(', ')}`
        );
      }
    }

    if (config.headerPayloadMatch && header) {
      validations.headerPayloadMatch = validateHeaderPayloadMatch(
        header,
        payload,
        config.headerPayloadMatch
      );
      if (!validations.headerPayloadMatch.valid) {
        failedValidations.push(
          `Mismatched: ${validations.headerPayloadMatch.mismatched?.join(', ')}`
        );
      }
    }

    // Final result
    const valid = failedValidations.length === 0;

    if (valid) {
      // Cache the validated token
      // TTL: use token expiry or 5 minutes, whichever is shorter
      const now = Math.floor(Date.now() / 1000);
      const exp = payload.exp as number | undefined;
      const ttlMs = exp
        ? Math.min((exp - now) * 1000, 5 * 60 * 1000)
        : 5 * 60 * 1000;

      if (ttlMs > 0) {
        await cache.set(
          cacheKey,
          { payload, exp },
          { ttl: ttlMs, namespace: JWT_NAMESPACE }
        );
      }
    }

    return {
      valid,
      payload,
      header,
      validations,
      error: valid ? undefined : failedValidations.join('; '),
    };
  } catch (error) {
    logger.error('JWT validation error', error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'JWT validation failed',
    };
  }
}

/**
 * Clear the validated token cache (useful for testing)
 * Note: This is a no-op as the new cache service doesn't support pattern-based clearing
 */
export async function clearValidationCache(): Promise<void> {
  // The new cache service doesn't support pattern-based clearing
  // Keys will expire naturally based on TTL
  logger.debug('clearValidationCache called - keys will expire based on TTL');
}
