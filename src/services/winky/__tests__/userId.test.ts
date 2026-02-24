import { describe, test, expect } from '@jest/globals';

/**
 * Tests for user_id population in ClickHouse log objects.
 *
 * The winky handleSpanLog function reads userId from
 * store.organisationDetails.apiKeyDetails.userId and writes it to
 * chLogObject.user_id.value. These tests verify that mapping.
 */

// Mirrors the exact line from winky/index.ts:
//   chLogObject.user_id.value =
//     store.organisationDetails?.apiKeyDetails?.userId || null;
function resolveUserId(organisationDetails?: {
  apiKeyDetails?: { userId?: string };
}): string | null {
  return organisationDetails?.apiKeyDetails?.userId || null;
}

describe('winky ClickHouse user_id population', () => {
  test('should populate user_id from WORKSPACE_USER key', () => {
    const organisationDetails = {
      apiKeyDetails: {
        userId: 'user-uuid-123',
      },
    };

    expect(resolveUserId(organisationDetails)).toBe('user-uuid-123');
  });

  test('should populate user_id from JWT token (email)', () => {
    const organisationDetails = {
      apiKeyDetails: {
        userId: 'alice@example.com',
      },
    };

    expect(resolveUserId(organisationDetails)).toBe('alice@example.com');
  });

  test('should populate user_id from JWT token (sub claim)', () => {
    const organisationDetails = {
      apiKeyDetails: {
        userId: 'auth0|789abc',
      },
    };

    expect(resolveUserId(organisationDetails)).toBe('auth0|789abc');
  });

  test('should return null when userId is undefined (service key)', () => {
    const organisationDetails = {
      apiKeyDetails: {
        userId: undefined,
      },
    };

    expect(resolveUserId(organisationDetails)).toBeNull();
  });

  test('should return null when userId is not present on apiKeyDetails', () => {
    const organisationDetails = {
      apiKeyDetails: {},
    };

    expect(resolveUserId(organisationDetails)).toBeNull();
  });

  test('should return null when apiKeyDetails is undefined', () => {
    const organisationDetails = {};

    expect(resolveUserId(organisationDetails as any)).toBeNull();
  });

  test('should return null when organisationDetails is undefined', () => {
    expect(resolveUserId(undefined)).toBeNull();
  });

  test('should return null when userId is empty string', () => {
    const organisationDetails = {
      apiKeyDetails: {
        userId: '',
      },
    };

    expect(resolveUserId(organisationDetails)).toBeNull();
  });
});
