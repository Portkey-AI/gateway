import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { AtomicCounterTypes, EntityStatus } from '../../globals';

// Define a flexible mock type for testing
type AnyMockFn = jest.Mock<(...args: any[]) => any>;

// Mock dependencies
const mockCacheGet = jest.fn() as AnyMockFn;
const mockCacheSet = jest.fn() as AnyMockFn;
const mockCacheGetSetMembers = jest.fn() as AnyMockFn;
const mockCacheAddToSet = jest.fn() as AnyMockFn;
const mockCacheRemoveFromSet = jest.fn() as AnyMockFn;
const mockIncrementInMemory = jest.fn() as AnyMockFn;

jest.mock('../../../../services/cache/cacheService', () => ({
  requestCache: jest.fn(() => ({
    get: mockCacheGet,
    set: mockCacheSet,
    getSetMembers: mockCacheGetSetMembers,
    addToSet: mockCacheAddToSet,
    removeFromSet: mockCacheRemoveFromSet,
  })),
}));

jest.mock('../../../../utils/cacheKeyTracker', () => ({
  incrementInMemory: (...args: unknown[]) => mockIncrementInMemory(...args),
}));

const mockResyncOrganisationData = jest.fn() as AnyMockFn;
jest.mock('../../../../services/albus', () => ({
  resyncOrganisationData: (...args: unknown[]) =>
    mockResyncOrganisationData(...args),
}));

jest.mock('../../../../apm', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock fetch utilities to avoid node-fetch ESM issues
jest.mock('../../../../utils/fetch', () => ({
  externalServiceFetch: jest.fn(),
  internalServiceFetch: jest.fn(),
}));

// Mock cache handler dependencies
jest.mock('../cache', () => ({
  generateV2CacheKey: jest.fn(
    (params: { key: string }) => `cache-key-${params.key}`
  ),
}));

import {
  matchBudgetPolicies,
  generateBudgetPolicyCounterKey,
  preRequestUsageLimitsPolicyValidator,
  postRequestUsageLimitsPolicyValidator,
} from '../usageLimitPolicies';
import type { UsageLimitsPolicy, OrganisationDetails } from '../../types';

// Helper to create test policies
function createTestPolicy(
  overrides: Partial<UsageLimitsPolicy> = {}
): UsageLimitsPolicy {
  return {
    id: 'policy-1',
    workspace_id: 'workspace-1',
    organisation_id: 'org-1',
    conditions: [],
    group_by: [],
    credit_limit: 100,
    type: 'cost',
    periodic_reset: null,
    status: EntityStatus.ACTIVE,
    ...overrides,
  };
}

// Helper to create test organisation details
function createTestOrgDetails(
  overrides: Partial<OrganisationDetails> = {}
): OrganisationDetails {
  return {
    id: 'org-1',
    ownerId: 'owner-1',
    name: 'Test Org',
    settings: {},
    isFirstGenerationDone: true,
    enterpriseSettings: {},
    workspaceDetails: {
      id: 'workspace-1',
      slug: 'test-workspace',
      defaults: {},
      usage_limits: [],
      rate_limits: [],
      status: EntityStatus.ACTIVE,
      policies: {
        usage_limits: [],
        rate_limits: [],
      },
    },
    scopes: [],
    defaults: {},
    usageLimits: [],
    rateLimits: [],
    status: EntityStatus.ACTIVE,
    apiKeyDetails: {
      id: 'api-key-1',
      key: 'test-api-key',
      isJwt: false,
      scopes: [],
      defaults: {},
      expiresAt: undefined,
      usageLimits: [],
      rateLimits: [],
      status: EntityStatus.ACTIVE,
      systemDefaults: {},
    },
    organisationDefaults: {},
    ...overrides,
  };
}

describe('usageLimitPolicies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheGetSetMembers.mockResolvedValue(new Set<string>());
    mockIncrementInMemory.mockReturnValue(undefined);
    mockResyncOrganisationData.mockResolvedValue(undefined);
  });

  describe('generateBudgetPolicyCounterKey', () => {
    test('should generate correct counter key for cost type', () => {
      const key = generateBudgetPolicyCounterKey({
        organisationId: 'org-123',
        policyId: 'policy-456',
        valueKey: 'api_key:key-789',
        counterType: AtomicCounterTypes.COST,
      });

      expect(key).toBe(
        'atomic-counter-org-123-cost-USAGE_LIMITS_POLICY-policy-456-api_key:key-789'
      );
    });

    test('should generate correct counter key for tokens type', () => {
      const key = generateBudgetPolicyCounterKey({
        organisationId: 'org-123',
        policyId: 'policy-456',
        valueKey: 'metadata._user:john',
        counterType: AtomicCounterTypes.TOKENS,
      });

      expect(key).toBe(
        'atomic-counter-org-123-tokens-USAGE_LIMITS_POLICY-policy-456-metadata._user:john'
      );
    });

    test('should handle complex valueKey with multiple groupBy fields', () => {
      const key = generateBudgetPolicyCounterKey({
        organisationId: 'org-123',
        policyId: 'policy-456',
        valueKey: 'api_key:key-1-metadata._user:user-1',
        counterType: AtomicCounterTypes.COST,
      });

      expect(key).toBe(
        'atomic-counter-org-123-cost-USAGE_LIMITS_POLICY-policy-456-api_key:key-1-metadata._user:user-1'
      );
    });
  });

  describe('matchBudgetPolicies', () => {
    const defaultContext = {
      apiKeyId: 'api-key-1',
      metadata: { _user: 'john', team: 'engineering' },
      organisationId: 'org-1',
      workspaceId: 'workspace-1',
    };

    test('should match policy with no conditions (matches all)', async () => {
      const policies = [createTestPolicy({ conditions: [] })];

      const matches = await matchBudgetPolicies({
        env: {},
        policies,
        context: defaultContext,
      });

      expect(matches).toHaveLength(1);
      expect(matches[0].policy.id).toBe('policy-1');
      expect(matches[0].valueKey).toBe('default');
      expect(matches[0].isExhausted).toBe(false);
    });

    test('should skip inactive policies', async () => {
      const policies = [
        createTestPolicy({ status: EntityStatus.ARCHIVED }),
        createTestPolicy({
          id: 'policy-2',
          status: EntityStatus.ACTIVE,
        }),
      ];

      const matches = await matchBudgetPolicies({
        env: {},
        policies,
        context: defaultContext,
      });

      expect(matches).toHaveLength(1);
      expect(matches[0].policy.id).toBe('policy-2');
    });

    test('should match policy with api_key condition', async () => {
      const policies = [
        createTestPolicy({
          conditions: [{ key: 'api_key', value: 'api-key-1' }],
        }),
      ];

      const matches = await matchBudgetPolicies({
        env: {},
        policies,
        context: defaultContext,
      });

      expect(matches).toHaveLength(1);
    });

    test('should not match policy with non-matching api_key condition', async () => {
      const policies = [
        createTestPolicy({
          conditions: [{ key: 'api_key', value: 'different-key' }],
        }),
      ];

      const matches = await matchBudgetPolicies({
        env: {},
        policies,
        context: defaultContext,
      });

      expect(matches).toHaveLength(0);
    });

    test('should match policy with wildcard condition', async () => {
      const policies = [
        createTestPolicy({
          conditions: [{ key: 'api_key', value: '*' }],
        }),
      ];

      const matches = await matchBudgetPolicies({
        env: {},
        policies,
        context: defaultContext,
      });

      expect(matches).toHaveLength(1);
    });

    test('should match policy with metadata condition', async () => {
      const policies = [
        createTestPolicy({
          conditions: [{ key: 'metadata._user' as any, value: 'john' }],
        }),
      ];

      const matches = await matchBudgetPolicies({
        env: {},
        policies,
        context: defaultContext,
      });

      expect(matches).toHaveLength(1);
    });

    test('should not match when metadata key is missing', async () => {
      const policies = [
        createTestPolicy({
          conditions: [{ key: 'metadata.nonexistent' as any, value: 'value' }],
        }),
      ];

      const matches = await matchBudgetPolicies({
        env: {},
        policies,
        context: defaultContext,
      });

      expect(matches).toHaveLength(0);
    });

    test('should require all conditions to match (AND logic)', async () => {
      const policies = [
        createTestPolicy({
          conditions: [
            { key: 'api_key', value: 'api-key-1' },
            { key: 'metadata._user' as any, value: 'john' },
          ],
        }),
      ];

      const matches = await matchBudgetPolicies({
        env: {},
        policies,
        context: defaultContext,
      });

      expect(matches).toHaveLength(1);
    });

    test('should not match when one condition fails', async () => {
      const policies = [
        createTestPolicy({
          conditions: [
            { key: 'api_key', value: 'api-key-1' },
            { key: 'metadata._user' as any, value: 'different-user' },
          ],
        }),
      ];

      const matches = await matchBudgetPolicies({
        env: {},
        policies,
        context: defaultContext,
      });

      expect(matches).toHaveLength(0);
    });

    test('should generate valueKey from groupBy fields', async () => {
      const policies = [
        createTestPolicy({
          group_by: [{ key: 'api_key' }],
        }),
      ];

      const matches = await matchBudgetPolicies({
        env: {},
        policies,
        context: defaultContext,
      });

      expect(matches).toHaveLength(1);
      expect(matches[0].valueKey).toBe('api_key:api-key-1');
    });

    test('should generate valueKey with multiple groupBy fields', async () => {
      const policies = [
        createTestPolicy({
          group_by: [{ key: 'api_key' }, { key: 'metadata._user' as any }],
        }),
      ];

      const matches = await matchBudgetPolicies({
        env: {},
        policies,
        context: defaultContext,
      });

      expect(matches).toHaveLength(1);
      expect(matches[0].valueKey).toBe('api_key:api-key-1-metadata._user:john');
    });

    test('should not match when groupBy field cannot be extracted', async () => {
      const policies = [
        createTestPolicy({
          group_by: [{ key: 'metadata.nonexistent' as any }],
        }),
      ];

      const matches = await matchBudgetPolicies({
        env: {},
        policies,
        context: defaultContext,
      });

      expect(matches).toHaveLength(0);
    });

    test('should mark as exhausted when valueKey is in exhausted set', async () => {
      mockCacheGetSetMembers.mockResolvedValue(new Set(['api_key:api-key-1']));

      const policies = [
        createTestPolicy({
          group_by: [{ key: 'api_key' }],
        }),
      ];

      const matches = await matchBudgetPolicies({
        env: {},
        policies,
        context: defaultContext,
      });

      expect(matches).toHaveLength(1);
      expect(matches[0].isExhausted).toBe(true);
    });

    test('should match policy with organisation_id condition', async () => {
      const policies = [
        createTestPolicy({
          conditions: [{ key: 'organisation_id', value: 'org-1' }],
        }),
      ];

      const matches = await matchBudgetPolicies({
        env: {},
        policies,
        context: defaultContext,
      });

      expect(matches).toHaveLength(1);
    });

    test('should match policy with workspace_id condition', async () => {
      const policies = [
        createTestPolicy({
          conditions: [{ key: 'workspace_id', value: 'workspace-1' }],
        }),
      ];

      const matches = await matchBudgetPolicies({
        env: {},
        policies,
        context: defaultContext,
      });

      expect(matches).toHaveLength(1);
    });

    test('should match multiple policies', async () => {
      const policies = [
        createTestPolicy({ id: 'policy-1', conditions: [] }),
        createTestPolicy({ id: 'policy-2', conditions: [] }),
        createTestPolicy({
          id: 'policy-3',
          conditions: [{ key: 'api_key', value: 'different-key' }],
        }),
      ];

      const matches = await matchBudgetPolicies({
        env: {},
        policies,
        context: defaultContext,
      });

      expect(matches).toHaveLength(2);
      expect(matches.map((m) => m.policy.id)).toEqual(['policy-1', 'policy-2']);
    });
  });

  describe('preRequestUsageLimitsPolicyValidator', () => {
    test('should return not exhausted when no policies exist', async () => {
      const orgDetails = createTestOrgDetails();

      const result = await preRequestUsageLimitsPolicyValidator({
        env: {},
        organisationDetails: orgDetails,
        metadata: {},
        virtualKeyDetails: null,
      });

      expect(result.isExhausted).toBe(false);
      expect(result.blockingPolicy).toBeUndefined();
    });

    test('should return not exhausted when policies exist but none are exhausted', async () => {
      const orgDetails = createTestOrgDetails({
        workspaceDetails: {
          id: 'workspace-1',
          slug: 'test-workspace',
          defaults: {},
          usage_limits: [],
          rate_limits: [],
          status: EntityStatus.ACTIVE,
          policies: {
            usage_limits: [createTestPolicy()],
            rate_limits: [],
          },
        },
      });

      const result = await preRequestUsageLimitsPolicyValidator({
        env: {},
        organisationDetails: orgDetails,
        metadata: {},
        virtualKeyDetails: null,
      });

      expect(result.isExhausted).toBe(false);
    });

    test('should return exhausted when a matching policy is exhausted', async () => {
      mockCacheGetSetMembers.mockResolvedValue(new Set(['default']));

      const orgDetails = createTestOrgDetails({
        workspaceDetails: {
          id: 'workspace-1',
          slug: 'test-workspace',
          defaults: {},
          usage_limits: [],
          rate_limits: [],
          status: EntityStatus.ACTIVE,
          policies: {
            usage_limits: [createTestPolicy()],
            rate_limits: [],
          },
        },
      });

      const result = await preRequestUsageLimitsPolicyValidator({
        env: {},
        organisationDetails: orgDetails,
        metadata: {},
        virtualKeyDetails: null,
      });

      expect(result.isExhausted).toBe(true);
      expect(result.blockingPolicy).toBeDefined();
      expect(result.blockingPolicy?.policy.id).toBe('policy-1');
    });

    test('should not block when no policies match', async () => {
      const orgDetails = createTestOrgDetails({
        workspaceDetails: {
          id: 'workspace-1',
          slug: 'test-workspace',
          defaults: {},
          usage_limits: [],
          rate_limits: [],
          status: EntityStatus.ACTIVE,
          policies: {
            usage_limits: [
              createTestPolicy({
                conditions: [{ key: 'api_key', value: 'different-key' }],
              }),
            ],
            rate_limits: [],
          },
        },
      });

      const result = await preRequestUsageLimitsPolicyValidator({
        env: {},
        organisationDetails: orgDetails,
        metadata: {},
        virtualKeyDetails: null,
      });

      expect(result.isExhausted).toBe(false);
    });
  });

  describe('postRequestUsageLimitsPolicyValidator', () => {
    test('should not increment when no policies exist', async () => {
      const orgDetails = createTestOrgDetails();

      await postRequestUsageLimitsPolicyValidator({
        env: {},
        organisationDetails: orgDetails,
        metadata: {},
        virtualKeyDetails: null,
        costAmount: 0.01,
        tokenAmount: 100,
      });

      expect(mockIncrementInMemory).not.toHaveBeenCalled();
    });

    test('should increment usage for matching cost-type policy', async () => {
      const orgDetails = createTestOrgDetails({
        workspaceDetails: {
          id: 'workspace-1',
          slug: 'test-workspace',
          defaults: {},
          usage_limits: [],
          rate_limits: [],
          status: EntityStatus.ACTIVE,
          policies: {
            usage_limits: [createTestPolicy({ type: 'cost' })],
            rate_limits: [],
          },
        },
      });

      await postRequestUsageLimitsPolicyValidator({
        env: {},
        organisationDetails: orgDetails,
        metadata: {},
        virtualKeyDetails: null,
        costAmount: 0.01,
        tokenAmount: 100,
      });

      expect(mockIncrementInMemory).toHaveBeenCalledWith(
        'org-1',
        expect.stringContaining(
          'atomic-counter-org-1-cost-USAGE_LIMITS_POLICY'
        ),
        0.01,
        {},
        expect.objectContaining({
          creditLimit: 10000, // 100 * 100 (dollars to cents conversion)
        })
      );
    });

    test('should increment usage for matching tokens-type policy', async () => {
      const orgDetails = createTestOrgDetails({
        workspaceDetails: {
          id: 'workspace-1',
          slug: 'test-workspace',
          defaults: {},
          usage_limits: [],
          rate_limits: [],
          status: EntityStatus.ACTIVE,
          policies: {
            usage_limits: [createTestPolicy({ type: 'tokens' })],
            rate_limits: [],
          },
        },
      });

      await postRequestUsageLimitsPolicyValidator({
        env: {},
        organisationDetails: orgDetails,
        metadata: {},
        virtualKeyDetails: null,
        costAmount: 0.01,
        tokenAmount: 100,
      });

      expect(mockIncrementInMemory).toHaveBeenCalledWith(
        'org-1',
        expect.stringContaining(
          'atomic-counter-org-1-tokens-USAGE_LIMITS_POLICY'
        ),
        100,
        {},
        expect.objectContaining({
          creditLimit: 100, // no conversion for tokens
        })
      );
    });

    test('should skip exhausted policies', async () => {
      mockCacheGetSetMembers.mockResolvedValue(new Set(['default']));

      const orgDetails = createTestOrgDetails({
        workspaceDetails: {
          id: 'workspace-1',
          slug: 'test-workspace',
          defaults: {},
          usage_limits: [],
          rate_limits: [],
          status: EntityStatus.ACTIVE,
          policies: {
            usage_limits: [createTestPolicy()],
            rate_limits: [],
          },
        },
      });

      await postRequestUsageLimitsPolicyValidator({
        env: {},
        organisationDetails: orgDetails,
        metadata: {},
        virtualKeyDetails: null,
        costAmount: 0.01,
        tokenAmount: 100,
      });

      expect(mockIncrementInMemory).not.toHaveBeenCalled();
    });

    test('should skip when amount is zero', async () => {
      const orgDetails = createTestOrgDetails({
        workspaceDetails: {
          id: 'workspace-1',
          slug: 'test-workspace',
          defaults: {},
          usage_limits: [],
          rate_limits: [],
          status: EntityStatus.ACTIVE,
          policies: {
            usage_limits: [createTestPolicy({ type: 'cost' })],
            rate_limits: [],
          },
        },
      });

      await postRequestUsageLimitsPolicyValidator({
        env: {},
        organisationDetails: orgDetails,
        metadata: {},
        virtualKeyDetails: null,
        costAmount: 0,
        tokenAmount: 0,
      });

      expect(mockIncrementInMemory).not.toHaveBeenCalled();
    });

    test('should increment multiple matching policies', async () => {
      const orgDetails = createTestOrgDetails({
        workspaceDetails: {
          id: 'workspace-1',
          slug: 'test-workspace',
          defaults: {},
          usage_limits: [],
          rate_limits: [],
          status: EntityStatus.ACTIVE,
          policies: {
            usage_limits: [
              createTestPolicy({ id: 'policy-1', type: 'cost' }),
              createTestPolicy({ id: 'policy-2', type: 'tokens' }),
            ],
            rate_limits: [],
          },
        },
      });

      await postRequestUsageLimitsPolicyValidator({
        env: {},
        organisationDetails: orgDetails,
        metadata: {},
        virtualKeyDetails: null,
        costAmount: 0.01,
        tokenAmount: 100,
      });

      expect(mockIncrementInMemory).toHaveBeenCalledTimes(2);
    });
  });
});
