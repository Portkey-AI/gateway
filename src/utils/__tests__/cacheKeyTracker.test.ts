import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Define a flexible mock type for testing
type AnyMockFn = jest.Mock<(...args: any[]) => any>;

// Mock the dependencies before importing the module
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

jest.mock('../../apm', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('hono/adapter', () => ({
  getRuntimeKey: jest.fn(() => 'node'),
}));

// Import after mocks are set up
import {
  incrementInMemory,
  getPendingIncrement,
  syncBudgetKeysToRedis,
  cleanupCacheKeyTracker,
  generateBudgetTrackingSetKey,
  getBudgetKeysFromRedis,
  getActiveOrganisationIds,
  removeBudgetKeysFromRedis,
  getInMemoryOrganisationIds,
  trackPromptCacheKey,
  getPromptCacheKeysFromRedis,
  removePromptCacheKeysFromRedis,
  generatePromptCacheTrackingSetKey,
} from '../cacheKeyTracker';

describe('cacheKeyTracker', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Clean up tracker state between tests
    cleanupCacheKeyTracker();

    // Reset default mock implementations
    mockCacheIncrement.mockResolvedValue(100);
    mockCacheAddToSet.mockResolvedValue(1);
    mockCacheRemoveFromSet.mockResolvedValue(1);
    mockCacheGetSetMembers.mockResolvedValue(new Set<string>());
  });

  describe('incrementInMemory', () => {
    test('should accumulate values for the same key', () => {
      incrementInMemory('org-1', 'test-key-1', 100);
      expect(getPendingIncrement('test-key-1')).toBe(100);

      incrementInMemory('org-1', 'test-key-1', 50);
      expect(getPendingIncrement('test-key-1')).toBe(150);

      incrementInMemory('org-1', 'test-key-1', 25);
      expect(getPendingIncrement('test-key-1')).toBe(175);
    });

    test('should track separate keys independently', () => {
      incrementInMemory('org-1', 'key-a', 100);
      incrementInMemory('org-1', 'key-b', 200);
      incrementInMemory('org-1', 'key-c', 300);

      expect(getPendingIncrement('key-a')).toBe(100);
      expect(getPendingIncrement('key-b')).toBe(200);
      expect(getPendingIncrement('key-c')).toBe(300);
    });

    test('should track keys for different organisations', () => {
      incrementInMemory('org-1', 'shared-key', 100);
      incrementInMemory('org-2', 'shared-key', 200);

      // Same key name but tracked under different orgs, so both contribute
      // to the same in-memory key (key is the full atomic counter key)
      expect(getPendingIncrement('shared-key')).toBe(300);
    });

    test('should track organisation IDs in memory', () => {
      incrementInMemory('org-1', 'key-1', 100);
      incrementInMemory('org-2', 'key-2', 200);

      const orgIds = getInMemoryOrganisationIds();
      expect(orgIds.has('org-1')).toBe(true);
      expect(orgIds.has('org-2')).toBe(true);
    });

    test('should return 0 for keys that have not been incremented', () => {
      expect(getPendingIncrement('nonexistent-key')).toBe(0);
    });

    test('should handle decimal amounts correctly', () => {
      incrementInMemory('org-1', 'decimal-key', 0.001);
      incrementInMemory('org-1', 'decimal-key', 0.002);
      incrementInMemory('org-1', 'decimal-key', 0.003);

      expect(getPendingIncrement('decimal-key')).toBeCloseTo(0.006, 10);
    });

    test('should handle zero amounts', () => {
      incrementInMemory('org-1', 'zero-key', 0);
      expect(getPendingIncrement('zero-key')).toBe(0);

      incrementInMemory('org-1', 'zero-key', 100);
      expect(getPendingIncrement('zero-key')).toBe(100);

      incrementInMemory('org-1', 'zero-key', 0);
      expect(getPendingIncrement('zero-key')).toBe(100);
    });
  });

  describe('syncBudgetKeysToRedis', () => {
    test('should sync organisation IDs to Redis', async () => {
      incrementInMemory('org-1', 'key-1', 100);
      incrementInMemory('org-2', 'key-2', 200);

      await syncBudgetKeysToRedis();

      expect(mockCacheAddToSet).toHaveBeenCalledWith(
        'active-budget-org-ids',
        'org-1',
        'org-2'
      );
    });

    test('should sync budget keys to Redis tracking sets', async () => {
      incrementInMemory('org-1', 'counter-key-1', 100);
      incrementInMemory('org-1', 'counter-key-2', 200);

      await syncBudgetKeysToRedis();

      expect(mockCacheAddToSet).toHaveBeenCalledWith(
        'active-budget-keys-org-1',
        'counter-key-1',
        'counter-key-2'
      );
    });

    test('should sync increments to Redis', async () => {
      incrementInMemory('org-1', 'key-1', 100);
      incrementInMemory('org-1', 'key-2', 200);

      await syncBudgetKeysToRedis();

      expect(mockCacheIncrement).toHaveBeenCalledWith('key-1', 100);
      expect(mockCacheIncrement).toHaveBeenCalledWith('key-2', 200);
    });

    test('should clear in-memory state after sync', async () => {
      incrementInMemory('org-1', 'key-1', 100);
      expect(getPendingIncrement('key-1')).toBe(100);

      await syncBudgetKeysToRedis();

      expect(getPendingIncrement('key-1')).toBe(0);
      expect(getInMemoryOrganisationIds().size).toBe(0);
    });

    test('should not call Redis when there is nothing to sync', async () => {
      await syncBudgetKeysToRedis();

      // Should not add to org IDs set when empty
      expect(mockCacheAddToSet).not.toHaveBeenCalledWith(
        'active-budget-org-ids',
        expect.anything()
      );
      expect(mockCacheIncrement).not.toHaveBeenCalled();
    });

    test('should not sync zero-value increments', async () => {
      incrementInMemory('org-1', 'key-1', 100);
      incrementInMemory('org-1', 'key-2', 0);

      await syncBudgetKeysToRedis();

      expect(mockCacheIncrement).toHaveBeenCalledWith('key-1', 100);
      expect(mockCacheIncrement).not.toHaveBeenCalledWith('key-2', 0);
    });
  });

  describe('generateBudgetTrackingSetKey', () => {
    test('should generate correct tracking set key', () => {
      const key = generateBudgetTrackingSetKey('org-123');
      expect(key).toBe('active-budget-keys-org-123');
    });

    test('should handle UUID organisation IDs', () => {
      const key = generateBudgetTrackingSetKey(
        '550e8400-e29b-41d4-a716-446655440000'
      );
      expect(key).toBe(
        'active-budget-keys-550e8400-e29b-41d4-a716-446655440000'
      );
    });
  });

  describe('getBudgetKeysFromRedis', () => {
    test('should return set of budget keys from Redis', async () => {
      const expectedKeys = new Set(['key-1', 'key-2', 'key-3']);
      mockCacheGetSetMembers.mockResolvedValue(expectedKeys);

      const result = await getBudgetKeysFromRedis('org-1');

      expect(mockCacheGetSetMembers).toHaveBeenCalledWith(
        'active-budget-keys-org-1'
      );
      expect(result).toEqual(expectedKeys);
    });

    test('should return empty set when no keys exist', async () => {
      mockCacheGetSetMembers.mockResolvedValue(new Set());

      const result = await getBudgetKeysFromRedis('org-1');

      expect(result.size).toBe(0);
    });
  });

  describe('getActiveOrganisationIds', () => {
    test('should return active organisation IDs from Redis', async () => {
      const expectedOrgIds = new Set(['org-1', 'org-2']);
      mockCacheGetSetMembers.mockResolvedValue(expectedOrgIds);

      const result = await getActiveOrganisationIds();

      expect(mockCacheGetSetMembers).toHaveBeenCalledWith(
        'active-budget-org-ids'
      );
      expect(result).toEqual(expectedOrgIds);
    });
  });

  describe('removeBudgetKeysFromRedis', () => {
    test('should remove keys from Redis tracking set', async () => {
      const keysToRemove = ['key-1', 'key-2'];

      await removeBudgetKeysFromRedis('org-1', keysToRemove);

      expect(mockCacheRemoveFromSet).toHaveBeenCalledWith(
        'active-budget-keys-org-1',
        ...keysToRemove
      );
    });

    test('should not call Redis when keys array is empty', async () => {
      await removeBudgetKeysFromRedis('org-1', []);

      expect(mockCacheRemoveFromSet).not.toHaveBeenCalled();
    });
  });

  describe('prompt cache key tracking', () => {
    test('should track prompt cache keys in memory', async () => {
      trackPromptCacheKey('org-1', 'prompt-cache-key-1');
      trackPromptCacheKey('org-1', 'prompt-cache-key-2');

      await syncBudgetKeysToRedis();

      expect(mockCacheAddToSet).toHaveBeenCalledWith(
        'prompt-cache-keys-org-1',
        'prompt-cache-key-1',
        'prompt-cache-key-2'
      );
    });

    test('should generate correct prompt cache tracking set key', () => {
      const key = generatePromptCacheTrackingSetKey('org-123');
      expect(key).toBe('prompt-cache-keys-org-123');
    });

    test('should get prompt cache keys from Redis', async () => {
      const expectedKeys = new Set(['prompt-1', 'prompt-2']);
      mockCacheGetSetMembers.mockResolvedValue(expectedKeys);

      const result = await getPromptCacheKeysFromRedis('org-1');

      expect(mockCacheGetSetMembers).toHaveBeenCalledWith(
        'prompt-cache-keys-org-1'
      );
      expect(result).toEqual(expectedKeys);
    });

    test('should remove prompt cache keys from Redis', async () => {
      await removePromptCacheKeysFromRedis('org-1', ['prompt-1', 'prompt-2']);

      expect(mockCacheRemoveFromSet).toHaveBeenCalledWith(
        'prompt-cache-keys-org-1',
        'prompt-1',
        'prompt-2'
      );
    });
  });

  describe('cleanupCacheKeyTracker', () => {
    test('should clear interval handles without errors', () => {
      // cleanupCacheKeyTracker clears interval handles and signal handlers
      // It does NOT clear in-memory data - that happens during syncBudgetKeysToRedis
      expect(() => cleanupCacheKeyTracker()).not.toThrow();
    });

    test('syncBudgetKeysToRedis should reset all in-memory state', async () => {
      incrementInMemory('org-1', 'key-1', 100);
      incrementInMemory('org-2', 'key-2', 200);
      trackPromptCacheKey('org-1', 'prompt-1');

      expect(getPendingIncrement('key-1')).toBe(100);
      expect(getInMemoryOrganisationIds().size).toBe(2);

      await syncBudgetKeysToRedis();

      expect(getPendingIncrement('key-1')).toBe(0);
      expect(getPendingIncrement('key-2')).toBe(0);
      expect(getInMemoryOrganisationIds().size).toBe(0);
    });
  });
});
