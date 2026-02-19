/**
 * @file src/shared/services/jwt/types.ts
 * Common types for JWT operations (signing, validation, claims)
 */

import { JWK, ProtectedHeaderParameters } from 'jose';

/**
 * Token info structure from OAuth introspection or API key mapping
 * Used for both JWT validation results and user identity forwarding
 */
export interface TokenInfo {
  token?: string;
  sub?: string;
  email?: string;
  username?: string;
  user_id?: string;
  workspace_id?: string;
  organisation_id?: string;
  scope?: string;
  client_id?: string;
  [key: string]: unknown;
}

// ============================================================================
// JWT Validation Types
// ============================================================================

/**
 * Claim value validation configuration
 */
export interface ClaimValueConfig {
  /** Expected value(s) to match against */
  values: string | string[];
  /**
   * Match type:
   * - 'exact': Exact string match (default)
   * - 'contains': Payload contains at least one expected value (OR)
   * - 'containsAll': Payload contains all expected values (AND)
   * - 'regex': Match against regex pattern
   */
  matchType?: 'exact' | 'contains' | 'containsAll' | 'regex';
}

/**
 * Configuration for JWT validation
 */
export interface JwtValidationConfig {
  // === Validation Method (one required) ===

  /** Inline JWKS for validation */
  jwks?: { keys: JWK[] };

  /** JWKS endpoint URI */
  jwksUri?: string;

  /** Token introspection endpoint (RFC 7662) */
  introspectEndpoint?: string;

  // === Validation Options ===

  /** Header containing JWT (default: 'Authorization') */
  headerKey?: string;

  /** Allowed algorithms (default: ['RS256']) */
  algorithms?: string[];

  /** Clock tolerance in seconds (default: 5) */
  clockTolerance?: number;

  /** JWKS cache TTL in seconds (default: 86400) */
  cacheMaxAge?: number;

  /**
   * Maximum token age as a duration string, passed to jose's jwtVerify.
   * Only applies for JWKS validation.
   *
   * Format: `<number><unit>` where unit is:
   * - `s` — seconds (e.g., '30s')
   * - `m` — minutes (e.g., '5m')
   * - `h` — hours (e.g., '12h')
   * - `d` — days (e.g., '1d')
   *
   * @example '30s', '5m', '12h', '1d'
   */
  maxTokenAge?: string;

  // === Introspection Options ===

  /** Content-Type for introspection requests (default: 'application/x-www-form-urlencoded') */
  introspectContentType?: string;

  /** Client ID for introspection endpoint authentication */
  introspectClientId?: string;

  /** Client secret for introspection endpoint authentication */
  introspectClientSecret?: string;

  /** Cache introspection results (seconds) */
  introspectCacheMaxAge?: number;

  // === Claim Validation ===

  /** Claims that must be present */
  requiredClaims?: string[];

  /** Expected claim values with match types */
  claimValues?: Record<string, ClaimValueConfig>;

  /** Header keys that must match payload values */
  headerPayloadMatch?: string[];
}

/**
 * Result of individual validation checks
 */
export interface ClaimValidationResult {
  valid: boolean;
  missing?: string[];
  failed?: string[];
  mismatched?: string[];
}

/**
 * Detailed validation results
 */
export interface ValidationDetails {
  signatureValid: boolean;
  requiredClaims?: ClaimValidationResult;
  claimValues?: ClaimValidationResult;
  headerPayloadMatch?: ClaimValidationResult;
}

/**
 * Result of JWT validation
 */
export interface ValidationResult {
  /** Whether the token is valid */
  valid: boolean;

  /** Decoded JWT payload (if valid) */
  payload?: Record<string, unknown>;

  /** Decoded JWT header (if valid) */
  header?: ProtectedHeaderParameters;

  /** Error message (if invalid) */
  error?: string;

  /** Detailed validation results */
  validations?: ValidationDetails;
}
