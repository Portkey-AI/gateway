import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import {
  AtomicCounterTypes,
  AtomicKeyTypes,
  EntityStatus,
} from '../../middlewares/portkey/globals';

// Define a flexible mock type for testing
type AnyMockFn = jest.Mock<(...args: any[]) => any>;

// Mock cache service
const mockCacheGet = jest.fn() as AnyMockFn;
const mockCacheSet = jest.fn() as AnyMockFn;
const mockCacheDelete = jest.fn() as AnyMockFn;
const mockCacheIncrement = jest.fn() as AnyMockFn;
const mockCacheAddToSet = jest.fn() as AnyMockFn;
const mockCacheRemoveFromSet = jest.fn() as AnyMockFn;
const mockCacheGetSetMembers = jest.fn() as AnyMockFn;

jest.mock('../../services/cache/cacheService', () => ({
  requestCache: jest.fn(() => ({
    get: mockCacheGet,
    set: mockCacheSet,
    delete: mockCacheDelete,
    increment: mockCacheIncrement,
    addToSet: mockCacheAddToSet,
    removeFromSet: mockCacheRemoveFromSet,
    getSetMembers: mockCacheGetSetMembers,
  })),
}));

// Mock albus service
const mockResyncOrganisationData = jest.fn() as AnyMockFn;
jest.mock('../../services/albus', () => ({
  resyncOrganisationData: (...args: unknown[]) =>
    mockResyncOrganisationData(...args),
}));

// Mock logger
jest.mock('../../apm', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock environment
jest.mock('../../utils/env', () => ({
  Environment: jest.fn(() => ({
    PRIVATE_DEPLOYMENT: 'ON',
    GATEWAY_CACHE_MODE: 'SELF',
    ORGANISATIONS_TO_SYNC: '',
  })),
}));

// Mock hono adapter
jest.mock('hono/adapter', () => ({
  getRuntimeKey: jest.fn(() => 'node'),
}));

import {
  incrementInMemory,
  getPendingIncrement,
  syncBudgetKeysToRedis,
  cleanupCacheKeyTracker,
  generateBudgetTrackingSetKey,
  getBudgetKeysFromRedis,
  getInMemoryOrganisationIds,
} from '../../utils/cacheKeyTracker';
import { generateAtomicCounterKey } from '../../utils/atomicCounter';
import { resyncDataWorker } from '../resyncDataWorker';

describe('Budget Tracking Integration Tests', () => {
  const testOrgId = '550e8400-e29b-41d4-a716-446655440000';
  const testVirtualKeyId = '660e8400-e29b-41d4-a716-446655440001';
  const testApiKeyId = '770e8400-e29b-41d4-a716-446655440002';
  const testPolicyId = '880e8400-e29b-41d4-a716-446655440003';

  beforeEach(() => {
    jest.clearAllMocks();
    cleanupCacheKeyTracker();

    // Default mock implementations
    mockCacheIncrement.mockResolvedValue(100);
    mockCacheAddToSet.mockResolvedValue(1);
    mockCacheRemoveFromSet.mockResolvedValue(1);
    mockCacheGetSetMembers.mockResolvedValue(new Set<string>());
    mockCacheGet.mockResolvedValue(null);
    mockCacheDelete.mockResolvedValue(true);
    mockResyncOrganisationData.mockResolvedValue(undefined);
  });

  describe('Full Budget Tracking Flow', () => {
    test('should track virtual key budget increments end-to-end', async () => {
      // Step 1: Simulate multiple API requests incrementing budget
      const counterKey = generateAtomicCounterKey({
        type: AtomicKeyTypes.VIRTUAL_KEY,
        organisationId: testOrgId,
        key: testVirtualKeyId,
        counterType: AtomicCounterTypes.COST,
      });

      // First request - 10 cents
      incrementInMemory(testOrgId, counterKey, 10);
      expect(getPendingIncrement(counterKey)).toBe(10);

      // Second request - 25 cents
      incrementInMemory(testOrgId, counterKey, 25);
      expect(getPendingIncrement(counterKey)).toBe(35);

      // Third request - 15 cents
      incrementInMemory(testOrgId, counterKey, 15);
      expect(getPendingIncrement(counterKey)).toBe(50);

      // Step 2: Verify org ID is tracked
      const trackedOrgIds = getInMemoryOrganisationIds();
      expect(trackedOrgIds.has(testOrgId)).toBe(true);

      // Step 3: Sync to Redis (simulating periodic sync)
      await syncBudgetKeysToRedis();

      // Step 4: Verify data was synced to Redis
      expect(mockCacheAddToSet).toHaveBeenCalledWith(
        'active-budget-org-ids',
        testOrgId
      );

      expect(mockCacheAddToSet).toHaveBeenCalledWith(
        generateBudgetTrackingSetKey(testOrgId),
        counterKey
      );

      expect(mockCacheIncrement).toHaveBeenCalledWith(counterKey, 50);

      // Step 5: Verify in-memory state is cleared
      expect(getPendingIncrement(counterKey)).toBe(0);
      expect(getInMemoryOrganisationIds().size).toBe(0);
    });

    test('should track API key budget increments end-to-end', async () => {
      const counterKey = generateAtomicCounterKey({
        type: AtomicKeyTypes.API_KEY,
        organisationId: testOrgId,
        key: testApiKeyId,
        counterType: AtomicCounterTypes.COST,
      });

      // Simulate requests
      incrementInMemory(testOrgId, counterKey, 5);
      incrementInMemory(testOrgId, counterKey, 10);
      incrementInMemory(testOrgId, counterKey, 7);

      expect(getPendingIncrement(counterKey)).toBe(22);

      await syncBudgetKeysToRedis();

      expect(mockCacheIncrement).toHaveBeenCalledWith(counterKey, 22);
    });

    test('should track usage limits policy budget increments', async () => {
      const valueKey = 'api_key:test-key-123';
      const counterKey = generateAtomicCounterKey({
        type: AtomicKeyTypes.USAGE_LIMITS_POLICY,
        organisationId: testOrgId,
        policyId: testPolicyId,
        valueKey: valueKey,
        counterType: AtomicCounterTypes.COST,
      });

      // Simulate multiple requests for the same policy+valueKey combination
      incrementInMemory(testOrgId, counterKey, 0.01);
      incrementInMemory(testOrgId, counterKey, 0.02);
      incrementInMemory(testOrgId, counterKey, 0.03);

      expect(getPendingIncrement(counterKey)).toBeCloseTo(0.06, 10);

      await syncBudgetKeysToRedis();

      expect(mockCacheIncrement).toHaveBeenCalledWith(
        counterKey,
        expect.closeTo(0.06, 10)
      );
    });

    test('should handle multiple organisations simultaneously', async () => {
      const orgId1 = '111e8400-e29b-41d4-a716-446655440001';
      const orgId2 = '222e8400-e29b-41d4-a716-446655440002';
      const orgId3 = '333e8400-e29b-41d4-a716-446655440003';

      const key1 = generateAtomicCounterKey({
        type: AtomicKeyTypes.VIRTUAL_KEY,
        organisationId: orgId1,
        key: 'vk-1',
        counterType: AtomicCounterTypes.COST,
      });

      const key2 = generateAtomicCounterKey({
        type: AtomicKeyTypes.API_KEY,
        organisationId: orgId2,
        key: 'ak-1',
        counterType: AtomicCounterTypes.TOKENS,
      });

      const key3 = generateAtomicCounterKey({
        type: AtomicKeyTypes.USAGE_LIMITS_POLICY,
        organisationId: orgId3,
        policyId: 'policy-1',
        valueKey: 'user:alice',
        counterType: AtomicCounterTypes.COST,
      });

      // Simulate concurrent requests from different orgs
      incrementInMemory(orgId1, key1, 100);
      incrementInMemory(orgId2, key2, 5000);
      incrementInMemory(orgId3, key3, 0.5);
      incrementInMemory(orgId1, key1, 50);
      incrementInMemory(orgId2, key2, 2500);

      const trackedOrgIds = getInMemoryOrganisationIds();
      expect(trackedOrgIds.size).toBe(3);
      expect(trackedOrgIds.has(orgId1)).toBe(true);
      expect(trackedOrgIds.has(orgId2)).toBe(true);
      expect(trackedOrgIds.has(orgId3)).toBe(true);

      expect(getPendingIncrement(key1)).toBe(150);
      expect(getPendingIncrement(key2)).toBe(7500);
      expect(getPendingIncrement(key3)).toBe(0.5);

      await syncBudgetKeysToRedis();

      // Verify all orgs synced
      expect(mockCacheAddToSet).toHaveBeenCalledWith(
        'active-budget-org-ids',
        orgId1,
        orgId2,
        orgId3
      );

      // Verify all increments synced
      expect(mockCacheIncrement).toHaveBeenCalledWith(key1, 150);
      expect(mockCacheIncrement).toHaveBeenCalledWith(key2, 7500);
      expect(mockCacheIncrement).toHaveBeenCalledWith(key3, 0.5);
    });
  });

  describe('Resync Worker Flow', () => {
    test('should process budget keys and send to control plane', async () => {
      // Setup: Mock Redis to return budget keys
      const budgetKey1 = generateAtomicCounterKey({
        type: AtomicKeyTypes.VIRTUAL_KEY,
        organisationId: testOrgId,
        key: testVirtualKeyId,
        counterType: AtomicCounterTypes.COST,
      });

      const budgetKey2 = generateAtomicCounterKey({
        type: AtomicKeyTypes.API_KEY,
        organisationId: testOrgId,
        key: testApiKeyId,
        counterType: AtomicCounterTypes.COST,
      });

      mockCacheGetSetMembers.mockImplementation(async (key: unknown) => {
        if (key === 'active-budget-org-ids') {
          return new Set([testOrgId]);
        }
        if (key === generateBudgetTrackingSetKey(testOrgId)) {
          return new Set([budgetKey1, budgetKey2]);
        }
        return new Set();
      });

      // Mock the cache values for the budget keys
      mockCacheGet.mockImplementation(async (key: unknown) => {
        if (key === budgetKey1) return '150';
        if (key === budgetKey2) return '75';
        return null;
      });

      // First sync the in-memory data to populate org IDs
      incrementInMemory(testOrgId, budgetKey1, 0);
      await syncBudgetKeysToRedis();

      // Run resync worker
      const result = await resyncDataWorker();

      expect(result).toBe(true);

      // Verify resyncOrganisationData was called with correct data
      expect(mockResyncOrganisationData).toHaveBeenCalledWith(
        expect.objectContaining({
          organisationId: testOrgId,
          virtualKeyIdsToUpdateUsage: expect.arrayContaining([
            expect.objectContaining({
              id: testVirtualKeyId,
              usage: 150,
            }),
          ]),
          apiKeysToUpdateUsage: expect.arrayContaining([
            expect.objectContaining({
              id: testApiKeyId,
              usage: 75,
            }),
          ]),
        })
      );

      // Verify keys were deleted from cache after processing
      expect(mockCacheDelete).toHaveBeenCalledWith(budgetKey1);
      expect(mockCacheDelete).toHaveBeenCalledWith(budgetKey2);

      // Verify keys were removed from tracking set
      expect(mockCacheRemoveFromSet).toHaveBeenCalledWith(
        generateBudgetTrackingSetKey(testOrgId),
        budgetKey1,
        budgetKey2
      );
    });

    test('should process usage limits policy updates', async () => {
      const valueKey = 'api_key:key-123';
      const policyBudgetKey = generateAtomicCounterKey({
        type: AtomicKeyTypes.USAGE_LIMITS_POLICY,
        organisationId: testOrgId,
        policyId: testPolicyId,
        valueKey: valueKey,
        counterType: AtomicCounterTypes.COST,
      });

      mockCacheGetSetMembers.mockImplementation(async (key: unknown) => {
        if (key === 'active-budget-org-ids') {
          return new Set([testOrgId]);
        }
        if (key === generateBudgetTrackingSetKey(testOrgId)) {
          return new Set([policyBudgetKey]);
        }
        return new Set();
      });

      mockCacheGet.mockImplementation(async (key: unknown) => {
        if (key === policyBudgetKey) return '50.5';
        return null;
      });

      // Populate org IDs
      incrementInMemory(testOrgId, policyBudgetKey, 0);
      await syncBudgetKeysToRedis();

      await resyncDataWorker();

      expect(mockResyncOrganisationData).toHaveBeenCalledWith(
        expect.objectContaining({
          organisationId: testOrgId,
          usageLimitsPoliciesToUpdateUsage: expect.arrayContaining([
            expect.objectContaining({
              id: testPolicyId,
              value_key: valueKey,
              usage: 50.5,
            }),
          ]),
        })
      );
    });

    test('should handle integration workspace budget updates', async () => {
      const integrationId = '990e8400-e29b-41d4-a716-446655440004';
      const workspaceId = 'aa0e8400-e29b-41d4-a716-446655440005';
      const integrationKey = `${integrationId}-${workspaceId}`;

      const budgetKey = generateAtomicCounterKey({
        type: AtomicKeyTypes.INTEGRATION_WORKSPACE,
        organisationId: testOrgId,
        key: integrationKey,
        counterType: AtomicCounterTypes.COST,
      });

      mockCacheGetSetMembers.mockImplementation(async (key: unknown) => {
        if (key === 'active-budget-org-ids') {
          return new Set([testOrgId]);
        }
        if (key === generateBudgetTrackingSetKey(testOrgId)) {
          return new Set([budgetKey]);
        }
        return new Set();
      });

      mockCacheGet.mockImplementation(async (key: unknown) => {
        if (key === budgetKey) return '200';
        return null;
      });

      incrementInMemory(testOrgId, budgetKey, 0);
      await syncBudgetKeysToRedis();

      await resyncDataWorker();

      expect(mockResyncOrganisationData).toHaveBeenCalledWith(
        expect.objectContaining({
          organisationId: testOrgId,
          integrationWorkspacesToUpdateUsage: expect.arrayContaining([
            expect.objectContaining({
              integration_id: integrationId,
              workspace_id: workspaceId,
              usage: 200,
            }),
          ]),
        })
      );
    });

    test('should skip keys with zero value', async () => {
      const budgetKey = generateAtomicCounterKey({
        type: AtomicKeyTypes.VIRTUAL_KEY,
        organisationId: testOrgId,
        key: testVirtualKeyId,
        counterType: AtomicCounterTypes.COST,
      });

      mockCacheGetSetMembers.mockImplementation(async (key: unknown) => {
        if (key === 'active-budget-org-ids') {
          return new Set([testOrgId]);
        }
        if (key === generateBudgetTrackingSetKey(testOrgId)) {
          return new Set([budgetKey]);
        }
        return new Set();
      });

      // Return zero value
      mockCacheGet.mockResolvedValue('0');

      incrementInMemory(testOrgId, budgetKey, 0);
      await syncBudgetKeysToRedis();

      await resyncDataWorker();

      // Should not call resync for zero-value keys
      expect(mockResyncOrganisationData).not.toHaveBeenCalled();
      expect(mockCacheDelete).not.toHaveBeenCalled();
    });

    test('should skip organisations with no budget keys', async () => {
      mockCacheGetSetMembers.mockImplementation(async (key: unknown) => {
        if (key === 'active-budget-org-ids') {
          return new Set([testOrgId]);
        }
        // Return empty set for budget keys
        return new Set();
      });

      incrementInMemory(testOrgId, 'dummy-key', 0);
      await syncBudgetKeysToRedis();

      await resyncDataWorker();

      expect(mockResyncOrganisationData).not.toHaveBeenCalled();
    });

    test('should handle errors gracefully and continue processing', async () => {
      const org1 = '111e8400-e29b-41d4-a716-446655440001';
      const org2 = '222e8400-e29b-41d4-a716-446655440002';

      const key1 = generateAtomicCounterKey({
        type: AtomicKeyTypes.VIRTUAL_KEY,
        organisationId: org1,
        key: 'vk-1',
        counterType: AtomicCounterTypes.COST,
      });

      const key2 = generateAtomicCounterKey({
        type: AtomicKeyTypes.VIRTUAL_KEY,
        organisationId: org2,
        key: 'vk-2',
        counterType: AtomicCounterTypes.COST,
      });

      mockCacheGetSetMembers.mockImplementation(async (key: unknown) => {
        if (key === 'active-budget-org-ids') {
          return new Set([org1, org2]);
        }
        if (key === generateBudgetTrackingSetKey(org1)) {
          return new Set([key1]);
        }
        if (key === generateBudgetTrackingSetKey(org2)) {
          return new Set([key2]);
        }
        return new Set();
      });

      mockCacheGet.mockImplementation(async (key: unknown) => {
        if (key === key1) return '100';
        if (key === key2) return '200';
        return null;
      });

      // Make first org's resync fail
      mockResyncOrganisationData.mockImplementation(
        async (args: { organisationId: string }) => {
          if (args.organisationId === org1) {
            throw new Error('Simulated error for org1');
          }
          return undefined;
        }
      );

      incrementInMemory(org1, key1, 0);
      incrementInMemory(org2, key2, 0);
      await syncBudgetKeysToRedis();

      const result = await resyncDataWorker();

      // Should still return true (continues despite errors)
      expect(result).toBe(true);

      // Both orgs should have been attempted
      expect(mockResyncOrganisationData).toHaveBeenCalledTimes(2);
    });
  });

  describe('Atomic Counter Key Generation', () => {
    test('should generate correct key for virtual key', () => {
      const key = generateAtomicCounterKey({
        type: AtomicKeyTypes.VIRTUAL_KEY,
        organisationId: testOrgId,
        key: testVirtualKeyId,
        counterType: AtomicCounterTypes.COST,
      });

      expect(key).toBe(
        `atomic-counter-${testOrgId}-cost-VIRTUAL_KEY-${testVirtualKeyId}`
      );
    });

    test('should generate correct key for API key', () => {
      const key = generateAtomicCounterKey({
        type: AtomicKeyTypes.API_KEY,
        organisationId: testOrgId,
        key: testApiKeyId,
        counterType: AtomicCounterTypes.TOKENS,
      });

      expect(key).toBe(
        `atomic-counter-${testOrgId}-tokens-API_KEY-${testApiKeyId}`
      );
    });

    test('should generate correct key for usage limits policy', () => {
      const valueKey = 'metadata._user:john';
      const key = generateAtomicCounterKey({
        type: AtomicKeyTypes.USAGE_LIMITS_POLICY,
        organisationId: testOrgId,
        policyId: testPolicyId,
        valueKey: valueKey,
        counterType: AtomicCounterTypes.COST,
      });

      expect(key).toBe(
        `atomic-counter-${testOrgId}-cost-USAGE_LIMITS_POLICY-${testPolicyId}-${valueKey}`
      );
    });

    test('should include usageLimitId when provided', () => {
      const usageLimitId = 'bb0e8400-e29b-41d4-a716-446655440006';
      const key = generateAtomicCounterKey({
        type: AtomicKeyTypes.VIRTUAL_KEY,
        organisationId: testOrgId,
        key: testVirtualKeyId,
        counterType: AtomicCounterTypes.COST,
        usageLimitId: usageLimitId,
      });

      expect(key).toBe(
        `atomic-counter-${testOrgId}-cost-VIRTUAL_KEY-${testVirtualKeyId}-usageLimitId-${usageLimitId}`
      );
    });
  });
});
