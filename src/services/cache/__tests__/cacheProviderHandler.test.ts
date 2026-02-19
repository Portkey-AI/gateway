import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { CacheProviderHandler } from '../cacheProviderHandler';
import type { ICacheProvider, CacheCapabilities } from '../types';

// Define a flexible mock type for testing
type AnyMockFn = jest.Mock<(...args: any[]) => any>;

// Mock the logger
jest.mock('../../../apm', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Create a mock provider with configurable capabilities
function createMockProvider(
  capabilities: Partial<CacheCapabilities> = {}
): ICacheProvider & {
  get: AnyMockFn;
  set: AnyMockFn;
  delete: AnyMockFn;
  exists: AnyMockFn;
  isHealthy: AnyMockFn;
  disconnect: AnyMockFn;
  // Set operations (optional based on capabilities)
  addToSet?: AnyMockFn;
  removeFromSet?: AnyMockFn;
  getSetMembers?: AnyMockFn;
  isSetMember?: AnyMockFn;
  // Atomic operations (optional based on capabilities)
  increment?: AnyMockFn;
  decrement?: AnyMockFn;
  getAtomicValue?: AnyMockFn;
} {
  const defaultCapabilities: CacheCapabilities = {
    supportsAtomicOps: true,
    supportsSets: true,
    supportsLuaScripts: false,
    supportsReadReplicas: false,
    ...capabilities,
  };

  const provider: any = {
    capabilities: defaultCapabilities,
    get: jest.fn() as AnyMockFn,
    set: jest.fn() as AnyMockFn,
    delete: jest.fn() as AnyMockFn,
    exists: jest.fn() as AnyMockFn,
    isHealthy: jest.fn() as AnyMockFn,
    disconnect: jest.fn() as AnyMockFn,
  };

  // Add set operations if supported
  if (defaultCapabilities.supportsSets) {
    provider.addToSet = jest.fn() as AnyMockFn;
    provider.removeFromSet = jest.fn() as AnyMockFn;
    provider.getSetMembers = jest.fn() as AnyMockFn;
    provider.isSetMember = jest.fn() as AnyMockFn;
  }

  // Add atomic operations if supported
  if (defaultCapabilities.supportsAtomicOps) {
    provider.increment = jest.fn() as AnyMockFn;
    provider.decrement = jest.fn() as AnyMockFn;
    provider.getAtomicValue = jest.fn() as AnyMockFn;
  }

  return provider;
}

describe('CacheProviderHandler', () => {
  describe('with native set support', () => {
    let mockProvider: ReturnType<typeof createMockProvider>;
    let handler: CacheProviderHandler;

    beforeEach(() => {
      jest.clearAllMocks();
      mockProvider = createMockProvider({ supportsSets: true });
      handler = new CacheProviderHandler(mockProvider);
    });

    describe('getSetMembers', () => {
      test('should call provider getSetMembers directly without memcache', async () => {
        mockProvider.getSetMembers!.mockResolvedValue(
          new Set(['key1', 'key2', 'key3'])
        );

        const result = await handler.getSetMembers('test-set');

        expect(mockProvider.getSetMembers).toHaveBeenCalledWith(
          'test-set',
          undefined,
          { useLocalCache: false, localCacheTtl: undefined }
        );
        expect(result).toEqual(new Set(['key1', 'key2', 'key3']));
      });

      test('should return Set with correct members, not individual characters', async () => {
        // This test ensures we get ['member1', 'member2'] not ['m','e','m','b','e','r','1',...]
        mockProvider.getSetMembers!.mockResolvedValue(
          new Set(['member1', 'member2'])
        );

        const result = await handler.getSetMembers('test-set');

        expect(result.size).toBe(2);
        expect(result.has('member1')).toBe(true);
        expect(result.has('member2')).toBe(true);
        // Should NOT have individual characters
        expect(result.has('m')).toBe(false);
        expect(result.has('e')).toBe(false);
      });

      test('should handle empty set', async () => {
        mockProvider.getSetMembers!.mockResolvedValue(new Set());

        const result = await handler.getSetMembers('empty-set');

        expect(result.size).toBe(0);
      });

      describe('with memcache enabled', () => {
        test('should pass cache options to provider getSetMembers', async () => {
          // Provider handles local caching internally
          mockProvider.getSetMembers!.mockResolvedValue(
            new Set(['cached1', 'cached2', 'cached3'])
          );

          const result = await handler.getSetMembers('test-set', true, 60);

          // Should call getSetMembers with cache options (provider handles caching internally)
          expect(mockProvider.getSetMembers).toHaveBeenCalledWith(
            'test-set',
            undefined,
            {
              useLocalCache: true,
              localCacheTtl: 60,
            }
          );
          expect(result).toEqual(new Set(['cached1', 'cached2', 'cached3']));
        });

        test('should pass useLocalCache true without explicit TTL', async () => {
          mockProvider.getSetMembers!.mockResolvedValue(
            new Set(['fresh1', 'fresh2'])
          );

          const result = await handler.getSetMembers('test-set', true);

          expect(mockProvider.getSetMembers).toHaveBeenCalledWith(
            'test-set',
            undefined,
            {
              useLocalCache: true,
              localCacheTtl: undefined,
            }
          );
          expect(result).toEqual(new Set(['fresh1', 'fresh2']));
        });

        test('should handle empty set from provider', async () => {
          mockProvider.getSetMembers!.mockResolvedValue(new Set());

          const result = await handler.getSetMembers('test-set', true);

          expect(mockProvider.getSetMembers).toHaveBeenCalledWith(
            'test-set',
            undefined,
            {
              useLocalCache: true,
              localCacheTtl: undefined,
            }
          );
          expect(result).toEqual(new Set());
          expect(result.size).toBe(0);
        });
      });
    });

    describe('addToSet', () => {
      test('should pass members array to provider', async () => {
        mockProvider.addToSet!.mockResolvedValue(3);

        const result = await handler.addToSet(
          'my-set',
          'member1',
          'member2',
          'member3'
        );

        // Handler collects spread args into array and passes to provider
        expect(mockProvider.addToSet).toHaveBeenCalledWith('my-set', [
          'member1',
          'member2',
          'member3',
        ]);
        expect(result).toBe(3);
      });

      test('should handle single member', async () => {
        mockProvider.addToSet!.mockResolvedValue(1);

        const result = await handler.addToSet('my-set', 'single-member');

        expect(mockProvider.addToSet).toHaveBeenCalledWith('my-set', [
          'single-member',
        ]);
        expect(result).toBe(1);
      });

      test('should handle many members via spread', async () => {
        mockProvider.addToSet!.mockResolvedValue(100);
        const members = Array.from({ length: 100 }, (_, i) => `member-${i}`);

        const result = await handler.addToSet('my-set', ...members);

        expect(mockProvider.addToSet).toHaveBeenCalledWith('my-set', members);
        expect(result).toBe(100);
      });
    });

    describe('removeFromSet', () => {
      test('should pass members array to provider', async () => {
        mockProvider.removeFromSet!.mockResolvedValue(2);

        const result = await handler.removeFromSet(
          'my-set',
          'member1',
          'member2'
        );

        // Handler collects spread args into array and passes to provider
        expect(mockProvider.removeFromSet).toHaveBeenCalledWith('my-set', [
          'member1',
          'member2',
        ]);
        expect(result).toBe(2);
      });
    });

    describe('isSetMember', () => {
      test('should check membership correctly', async () => {
        mockProvider.isSetMember!.mockResolvedValue(true);

        const result = await handler.isSetMember('my-set', 'member1');

        expect(mockProvider.isSetMember).toHaveBeenCalledWith(
          'my-set',
          'member1'
        );
        expect(result).toBe(true);
      });
    });
  });

  describe('without native set support (emulated)', () => {
    let mockProvider: ReturnType<typeof createMockProvider>;
    let handler: CacheProviderHandler;

    beforeEach(() => {
      jest.clearAllMocks();
      mockProvider = createMockProvider({ supportsSets: false });
      handler = new CacheProviderHandler(mockProvider);
    });

    describe('getSetMembers (emulated)', () => {
      test('should emulate set members from JSON array', async () => {
        mockProvider.get.mockResolvedValue(['emulated1', 'emulated2']);

        const result = await handler.getSetMembers('test-set');

        // Emulated version uses provider.get with cache options
        expect(mockProvider.get).toHaveBeenCalledWith('test-set', {
          useLocalCache: false,
          localCacheTtl: undefined,
        });
        expect(result).toEqual(new Set(['emulated1', 'emulated2']));
      });

      test('should return empty set when key does not exist', async () => {
        mockProvider.get.mockResolvedValue(null);

        const result = await handler.getSetMembers('nonexistent-set');

        expect(result).toEqual(new Set());
      });

      test('should handle emulated get returning undefined', async () => {
        mockProvider.get.mockResolvedValue(undefined);

        const result = await handler.getSetMembers('test-set');

        expect(result).toEqual(new Set());
      });
    });

    describe('addToSet (emulated)', () => {
      test('should emulate adding to set', async () => {
        mockProvider.get.mockResolvedValue(null);
        mockProvider.set.mockResolvedValue(true);

        const result = await handler.addToSet('my-set', 'new-member');

        // Emulated version reads existing, adds, then writes back
        expect(mockProvider.get).toHaveBeenCalled();
        expect(mockProvider.set).toHaveBeenCalled();
        expect(result).toBe(1);
      });

      test('should not add duplicate members', async () => {
        mockProvider.get.mockResolvedValue(['existing-member']);
        mockProvider.set.mockResolvedValue(true);

        const result = await handler.addToSet('my-set', 'existing-member');

        // Should return 0 since member already exists
        expect(result).toBe(0);
      });
    });
  });

  describe('atomic operations', () => {
    let mockProvider: ReturnType<typeof createMockProvider>;
    let handler: CacheProviderHandler;

    beforeEach(() => {
      jest.clearAllMocks();
      mockProvider = createMockProvider({ supportsAtomicOps: true });
      handler = new CacheProviderHandler(mockProvider);
    });

    describe('increment', () => {
      test('should increment by default amount of 1', async () => {
        mockProvider.increment!.mockResolvedValue(101);

        const result = await handler.increment('counter');

        expect(mockProvider.increment).toHaveBeenCalledWith('counter', 1);
        expect(result).toBe(101);
      });

      test('should increment by specified amount', async () => {
        mockProvider.increment!.mockResolvedValue(150);

        const result = await handler.increment('counter', 50);

        expect(mockProvider.increment).toHaveBeenCalledWith('counter', 50);
        expect(result).toBe(150);
      });

      test('should handle decimal increments', async () => {
        mockProvider.increment!.mockResolvedValue(0.003);

        const result = await handler.increment('counter', 0.001);

        expect(mockProvider.increment).toHaveBeenCalledWith('counter', 0.001);
        expect(result).toBeCloseTo(0.003, 10);
      });
    });

    describe('decrement', () => {
      test('should decrement by default amount of 1', async () => {
        mockProvider.decrement!.mockResolvedValue(99);

        const result = await handler.decrement('counter');

        expect(mockProvider.decrement).toHaveBeenCalledWith('counter', 1);
        expect(result).toBe(99);
      });

      test('should decrement by specified amount', async () => {
        mockProvider.decrement!.mockResolvedValue(50);

        const result = await handler.decrement('counter', 50);

        expect(mockProvider.decrement).toHaveBeenCalledWith('counter', 50);
        expect(result).toBe(50);
      });
    });

    describe('getNumber', () => {
      test('should return atomic value', async () => {
        mockProvider.getAtomicValue!.mockResolvedValue(123);

        const result = await handler.getNumber('counter');

        expect(mockProvider.getAtomicValue).toHaveBeenCalledWith('counter');
        expect(result).toBe(123);
      });
    });

    describe('batchIncrement', () => {
      test('should increment all keys in parallel', async () => {
        mockProvider.increment!.mockResolvedValue(100);
        const increments = new Map([
          ['key1', 10],
          ['key2', 20],
          ['key3', 30],
        ]);

        await handler.batchIncrement(increments);

        expect(mockProvider.increment).toHaveBeenCalledTimes(3);
        expect(mockProvider.increment).toHaveBeenCalledWith('key1', 10);
        expect(mockProvider.increment).toHaveBeenCalledWith('key2', 20);
        expect(mockProvider.increment).toHaveBeenCalledWith('key3', 30);
      });

      test('should skip zero-value increments', async () => {
        mockProvider.increment!.mockResolvedValue(100);
        const increments = new Map([
          ['key1', 10],
          ['key2', 0], // Should be skipped
          ['key3', 30],
        ]);

        await handler.batchIncrement(increments);

        expect(mockProvider.increment).toHaveBeenCalledTimes(2);
        expect(mockProvider.increment).not.toHaveBeenCalledWith('key2', 0);
      });
    });
  });

  describe('basic operations', () => {
    let mockProvider: ReturnType<typeof createMockProvider>;
    let handler: CacheProviderHandler;

    beforeEach(() => {
      jest.clearAllMocks();
      mockProvider = createMockProvider();
      handler = new CacheProviderHandler(mockProvider);
    });

    describe('get', () => {
      test('should proxy to provider get', async () => {
        mockProvider.get.mockResolvedValue({ data: 'test' });

        const result = await handler.get('test-key');

        expect(mockProvider.get).toHaveBeenCalledWith('test-key', undefined);
        expect(result).toEqual({ data: 'test' });
      });

      test('should pass options to provider', async () => {
        mockProvider.get.mockResolvedValue({ data: 'test' });

        await handler.get('test-key', { useLocalCache: true });

        expect(mockProvider.get).toHaveBeenCalledWith('test-key', {
          useLocalCache: true,
        });
      });
    });

    describe('set', () => {
      test('should proxy to provider set', async () => {
        mockProvider.set.mockResolvedValue(true);

        const result = await handler.set('test-key', { data: 'value' });

        expect(mockProvider.set).toHaveBeenCalledWith(
          'test-key',
          { data: 'value' },
          undefined
        );
        expect(result).toBe(true);
      });

      test('should pass options to provider', async () => {
        mockProvider.set.mockResolvedValue(true);

        await handler.set('test-key', { data: 'value' }, { ttl: 3600 });

        expect(mockProvider.set).toHaveBeenCalledWith(
          'test-key',
          { data: 'value' },
          { ttl: 3600 }
        );
      });
    });

    describe('delete', () => {
      test('should proxy single key to provider', async () => {
        mockProvider.delete.mockResolvedValue(true);

        const result = await handler.delete('test-key');

        expect(mockProvider.delete).toHaveBeenCalledWith('test-key', undefined);
        expect(result).toBe(true);
      });

      test('should proxy array of keys to provider', async () => {
        mockProvider.delete.mockResolvedValue(true);

        const result = await handler.delete(['key1', 'key2', 'key3']);

        expect(mockProvider.delete).toHaveBeenCalledWith(
          ['key1', 'key2', 'key3'],
          undefined
        );
        expect(result).toBe(true);
      });
    });

    describe('exists', () => {
      test('should proxy to provider exists', async () => {
        mockProvider.exists.mockResolvedValue(true);

        const result = await handler.exists('test-key');

        expect(mockProvider.exists).toHaveBeenCalledWith('test-key', undefined);
        expect(result).toBe(true);
      });
    });
  });

  describe('capabilities', () => {
    test('should expose provider capabilities', () => {
      const mockProvider = createMockProvider({
        supportsAtomicOps: true,
        supportsSets: true,
        supportsLuaScripts: true,
        supportsReadReplicas: true,
      });
      const handler = new CacheProviderHandler(mockProvider);

      expect(handler.capabilities).toEqual({
        supportsAtomicOps: true,
        supportsSets: true,
        supportsLuaScripts: true,
        supportsReadReplicas: true,
      });
    });

    test('supportsScripts should return correct value', () => {
      const provider1 = createMockProvider({ supportsLuaScripts: true });
      const provider2 = createMockProvider({ supportsLuaScripts: false });

      const handler1 = new CacheProviderHandler(provider1);
      const handler2 = new CacheProviderHandler(provider2);

      expect(handler1.supportsScripts).toBe(true);
      expect(handler2.supportsScripts).toBe(false);
    });

    test('supportsNativeSets should return correct value', () => {
      const provider1 = createMockProvider({ supportsSets: true });
      const provider2 = createMockProvider({ supportsSets: false });

      const handler1 = new CacheProviderHandler(provider1);
      const handler2 = new CacheProviderHandler(provider2);

      expect(handler1.supportsNativeSets).toBe(true);
      expect(handler2.supportsNativeSets).toBe(false);
    });

    test('supportsAtomicOps should return correct value', () => {
      const provider1 = createMockProvider({ supportsAtomicOps: true });
      const provider2 = createMockProvider({ supportsAtomicOps: false });

      const handler1 = new CacheProviderHandler(provider1);
      const handler2 = new CacheProviderHandler(provider2);

      expect(handler1.supportsAtomicOps).toBe(true);
      expect(handler2.supportsAtomicOps).toBe(false);
    });
  });

  describe('edge cases for spreading bugs', () => {
    let mockProvider: ReturnType<typeof createMockProvider>;
    let handler: CacheProviderHandler;

    beforeEach(() => {
      jest.clearAllMocks();
      mockProvider = createMockProvider({ supportsSets: true });
      handler = new CacheProviderHandler(mockProvider);
    });

    test('getSetMembers should never return individual characters from string spread', async () => {
      // Simulate a bug where something returns a string
      // The Set constructor on a string spreads into characters: new Set("abc") -> Set{"a","b","c"}
      // This test ensures our code path never creates this situation

      const budgetKey =
        'atomic-counter-org-123-cost-VIRTUAL_KEY-vk-456-usageLimitId-ul-789';

      // Provider returns correct Set
      mockProvider.getSetMembers!.mockResolvedValue(new Set([budgetKey]));

      const result = await handler.getSetMembers('test-set');

      // Should have the full string as one member
      expect(result.size).toBe(1);
      expect(result.has(budgetKey)).toBe(true);

      // Should NOT have been spread into individual characters
      expect(result.has('a')).toBe(false);
      expect(result.has('t')).toBe(false);
      expect(result.has('o')).toBe(false);
    });

    test('memcache path should pass cache options to provider', async () => {
      // With the simplified implementation, caching is handled by the provider
      // The handler just passes through the options
      mockProvider.getSetMembers!.mockResolvedValue(new Set(['correct-key']));

      const result = await handler.getSetMembers('test-set', true);

      // Should have called getSetMembers with cache options
      expect(mockProvider.getSetMembers).toHaveBeenCalledWith(
        'test-set',
        undefined,
        {
          useLocalCache: true,
          localCacheTtl: undefined,
        }
      );

      // Result should be correct
      expect(result.size).toBe(1);
      expect(result.has('correct-key')).toBe(true);
    });

    test('spreading array of budget keys should preserve full keys', async () => {
      const budgetKeys = [
        'atomic-counter-org-1-cost-VIRTUAL_KEY-vk-1',
        'atomic-counter-org-1-cost-VIRTUAL_KEY-vk-2',
        'atomic-counter-org-1-tokens-API_KEY-ak-1',
      ];

      mockProvider.getSetMembers!.mockResolvedValue(new Set(budgetKeys));

      const result = await handler.getSetMembers('budget-keys-org-1');

      expect(result.size).toBe(3);
      budgetKeys.forEach((key) => {
        expect(result.has(key)).toBe(true);
      });

      // Verify we can iterate and spread without losing data
      const asArray = [...result];
      expect(asArray.length).toBe(3);
      expect(asArray).toEqual(expect.arrayContaining(budgetKeys));
    });
  });
});
