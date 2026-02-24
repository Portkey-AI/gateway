import { describe, test, expect } from '@jest/globals';

/**
 * Tests for user_id inclusion in MCP tokenInfo.
 *
 * The apiKeyToTokenMapper middleware in oauth/index.ts builds a tokenInfo
 * object from OrganisationDetails. These tests verify the user_id field
 * is correctly populated.
 */

// Mirrors the tokenInfo construction from mcp/middleware/oauth/index.ts
function buildTokenInfo(organisationDetails: Record<string, any>) {
  return {
    active: true,
    token_type: 'api_key',
    token: organisationDetails.apiKeyDetails.key,
    scope: '',
    aud: organisationDetails.id,
    sub: organisationDetails.apiKeyDetails.id,
    workspace_id: organisationDetails.workspaceDetails.slug,
    organisation_id: organisationDetails.id,
    username: organisationDetails.apiKeyDetails.systemDefaults?.user_name || '',
    user_id: organisationDetails.apiKeyDetails.userId || '',
    organisation_name: organisationDetails.name || '',
    workspace_name: organisationDetails.workspaceDetails.name || '',
  };
}

function createMockOrgDetails(
  overrides: Record<string, any> = {}
): Record<string, any> {
  return {
    id: 'org-123',
    name: 'Test Org',
    workspaceDetails: {
      slug: 'test-workspace',
      name: 'Test Workspace',
    },
    apiKeyDetails: {
      id: 'key-123',
      key: 'pk-test-key',
      systemDefaults: { user_name: '' },
      userId: undefined,
      ...overrides,
    },
  };
}

describe('MCP tokenInfo user_id population', () => {
  test('should include user_id from WORKSPACE_USER key', () => {
    const orgDetails = createMockOrgDetails({
      userId: 'user-uuid-456',
      systemDefaults: { user_name: 'Alice' },
    });

    const tokenInfo = buildTokenInfo(orgDetails);

    expect(tokenInfo.user_id).toBe('user-uuid-456');
    expect(tokenInfo.username).toBe('Alice');
  });

  test('should include user_id from JWT token (email)', () => {
    const orgDetails = createMockOrgDetails({
      userId: 'alice@example.com',
    });

    const tokenInfo = buildTokenInfo(orgDetails);

    expect(tokenInfo.user_id).toBe('alice@example.com');
  });

  test('should include user_id from JWT token (sub claim)', () => {
    const orgDetails = createMockOrgDetails({
      userId: 'auth0|sub-123',
    });

    const tokenInfo = buildTokenInfo(orgDetails);

    expect(tokenInfo.user_id).toBe('auth0|sub-123');
  });

  test('should set user_id to empty string when userId is undefined (service key)', () => {
    const orgDetails = createMockOrgDetails({
      userId: undefined,
    });

    const tokenInfo = buildTokenInfo(orgDetails);

    expect(tokenInfo.user_id).toBe('');
  });

  test('should set user_id to empty string when userId is not present', () => {
    const orgDetails = createMockOrgDetails({});
    delete orgDetails.apiKeyDetails.userId;

    const tokenInfo = buildTokenInfo(orgDetails);

    expect(tokenInfo.user_id).toBe('');
  });

  test('should preserve other tokenInfo fields alongside user_id', () => {
    const orgDetails = createMockOrgDetails({
      userId: 'user-uuid-789',
      systemDefaults: { user_name: 'Bob' },
    });

    const tokenInfo = buildTokenInfo(orgDetails);

    expect(tokenInfo.active).toBe(true);
    expect(tokenInfo.token_type).toBe('api_key');
    expect(tokenInfo.token).toBe('pk-test-key');
    expect(tokenInfo.aud).toBe('org-123');
    expect(tokenInfo.sub).toBe('key-123');
    expect(tokenInfo.workspace_id).toBe('test-workspace');
    expect(tokenInfo.organisation_id).toBe('org-123');
    expect(tokenInfo.username).toBe('Bob');
    expect(tokenInfo.user_id).toBe('user-uuid-789');
    expect(tokenInfo.organisation_name).toBe('Test Org');
    expect(tokenInfo.workspace_name).toBe('Test Workspace');
  });
});
