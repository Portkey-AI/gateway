import { describe, test, expect } from '@jest/globals';
import { EntityStatus } from '../../portkey/globals';
import type { OrganisationDetails } from '../../portkey/types';

/**
 * Tests for the userId mapping logic in authN middleware.
 *
 * The authN middleware maps `apiKeyDetails.api_key_details.user_id`
 * from the Albus response into `organisationDetails.apiKeyDetails.userId`.
 * These tests verify that mapping logic in isolation.
 */

// Helper that mirrors the exact mapping logic from authN.ts (lines 87-100)
function buildApiKeyDetails(albusApiKeyDetails: Record<string, any>) {
  const usageLimits = Array.isArray(albusApiKeyDetails.usage_limits)
    ? albusApiKeyDetails.usage_limits
    : albusApiKeyDetails.usage_limits
      ? [albusApiKeyDetails.usage_limits]
      : [];

  return {
    id: albusApiKeyDetails.id,
    key: albusApiKeyDetails.key || 'fallback-key',
    isJwt: false,
    scopes: albusApiKeyDetails.scopes || [],
    defaults: albusApiKeyDetails.defaults || {},
    expiresAt: albusApiKeyDetails.expires_at,
    usageLimits: usageLimits,
    rateLimits: albusApiKeyDetails.rate_limits || [],
    status: albusApiKeyDetails.status || EntityStatus.ACTIVE,
    systemDefaults: albusApiKeyDetails.system_defaults,
    userId: albusApiKeyDetails.user_id || undefined,
  };
}

describe('authN userId mapping', () => {
  test('should map user_id from WORKSPACE_USER key response', () => {
    const albusResponse = {
      id: 'key-uuid-123',
      key: 'pk-test-key',
      scopes: ['completions'],
      defaults: {},
      usage_limits: [],
      rate_limits: [],
      status: EntityStatus.ACTIVE,
      expires_at: undefined,
      system_defaults: { user_name: 'Alice' },
      user_id: 'user-uuid-456',
    };

    const result = buildApiKeyDetails(albusResponse);

    expect(result.userId).toBe('user-uuid-456');
  });

  test('should map user_id from JWT token response (email)', () => {
    const albusResponse = {
      id: '00000000-0000-0000-0000-000000000000',
      key: 'jwt_eyJhbGciO',
      scopes: ['completions'],
      defaults: {},
      usage_limits: null,
      rate_limits: [],
      status: EntityStatus.ACTIVE,
      expires_at: undefined,
      auth_type: 'JWT',
      user_id: 'alice@example.com',
    };

    const result = buildApiKeyDetails(albusResponse);

    expect(result.userId).toBe('alice@example.com');
  });

  test('should map user_id from JWT token response (sub claim)', () => {
    const albusResponse = {
      id: '00000000-0000-0000-0000-000000000000',
      key: 'jwt_eyJhbGciO',
      scopes: [],
      defaults: {},
      usage_limits: null,
      rate_limits: [],
      status: EntityStatus.ACTIVE,
      expires_at: undefined,
      auth_type: 'JWT',
      user_id: 'auth0|123456789',
    };

    const result = buildApiKeyDetails(albusResponse);

    expect(result.userId).toBe('auth0|123456789');
  });

  test('should return undefined when user_id is absent (WORKSPACE_SERVICE key)', () => {
    const albusResponse = {
      id: 'key-uuid-789',
      key: 'pk-service-key',
      scopes: ['completions'],
      defaults: {},
      usage_limits: [],
      rate_limits: [],
      status: EntityStatus.ACTIVE,
      expires_at: undefined,
      // No user_id — service key
    };

    const result = buildApiKeyDetails(albusResponse);

    expect(result.userId).toBeUndefined();
  });

  test('should return undefined when user_id is null (old cached entry)', () => {
    const albusResponse = {
      id: 'key-uuid-000',
      key: 'pk-old-key',
      scopes: [],
      defaults: {},
      usage_limits: [],
      rate_limits: [],
      status: EntityStatus.ACTIVE,
      expires_at: undefined,
      user_id: null,
    };

    const result = buildApiKeyDetails(albusResponse);

    // null || undefined → undefined
    expect(result.userId).toBeUndefined();
  });

  test('should return undefined when user_id is empty string', () => {
    const albusResponse = {
      id: 'key-uuid-000',
      key: 'pk-empty-user',
      scopes: [],
      defaults: {},
      usage_limits: [],
      rate_limits: [],
      status: EntityStatus.ACTIVE,
      expires_at: undefined,
      user_id: '',
    };

    const result = buildApiKeyDetails(albusResponse);

    // '' || undefined → undefined
    expect(result.userId).toBeUndefined();
  });
});
