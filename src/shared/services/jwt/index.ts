/**
 * @file src/shared/services/jwt/index.ts
 * Shared JWT utilities for signing and validation
 */

// Types
export * from './types';

// Key management (for signing)
export {
  getPrivateKey,
  getKeyId,
  getPublicKeyJWK,
  clearKeyCache,
} from './keys';

// Claim utilities
export {
  filterClaims,
  getClaimsCacheKey,
  hashToken,
  checkTokenExpiry,
  validateRequiredClaims,
  validateClaimValues,
  validateHeaderPayloadMatch,
} from './claims';

// JWKS utilities
export {
  fetchJwks,
  getMatchingKey,
  validateWithJwks,
  clearCryptoKeyCache,
} from './jwks';

// Token introspection
export { validateViaIntrospection } from './introspection';

// Main validator
export { validateJwt, clearValidationCache } from './validator';
