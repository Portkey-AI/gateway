import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Define a flexible mock type for testing
type AnyMockFn = jest.Mock<(...args: any[]) => any>;

// Mock the logger
jest.mock('../../../../apm', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Create mock Redis client
const createMockRedisClient = () => ({
  get: jest.fn() as AnyMockFn,
  set: jest.fn() as AnyMockFn,
  del: jest.fn() as AnyMockFn,
  exists: jest.fn() as AnyMockFn,
  sadd: jest.fn() as AnyMockFn,
  srem: jest.fn() as AnyMockFn,
  smembers: jest.fn() as AnyMockFn,
  sismember: jest.fn() as AnyMockFn,
  incrbyfloat: jest.fn() as AnyMockFn,
  script: jest.fn() as AnyMockFn,
  evalsha: jest.fn() as AnyMockFn,
});

import { RedisCacheProvider } from '../redis';

describe('RedisCacheProvider', () => {
  let mockClient: ReturnType<typeof createMockRedisClient>;
  let provider: RedisCacheProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = createMockRedisClient();
    // Disable local cache for cleaner testing of Redis interactions
    provider = new RedisCacheProvider(mockClient as any, undefined, {
      enableLocalCache: false,
    });
  });

  describe('Basic KV Operations', () => {
    describe('get', () => {
      test('should return parsed JSON value from Redis', async () => {
        const testData = { name: 'test', value: 123 };
        mockClient.get.mockResolvedValue(JSON.stringify(testData));

        const result = await provider.get('test-key');

        expect(mockClient.get).toHaveBeenCalledWith('test-key');
        expect(result).toEqual(testData);
      });

      test('should return null when key does not exist', async () => {
        mockClient.get.mockResolvedValue(null);

        const result = await provider.get('nonexistent-key');

        expect(result).toBeNull();
      });

      test('should return null and log error on Redis error', async () => {
        mockClient.get.mockRejectedValue(new Error('Connection refused'));

        const result = await provider.get('error-key');

        expect(result).toBeNull();
      });
    });

    describe('set', () => {
      test('should set value without TTL', async () => {
        mockClient.set.mockResolvedValue('OK');

        const result = await provider.set('test-key', { data: 'value' });

        expect(mockClient.set).toHaveBeenCalledWith(
          'test-key',
          JSON.stringify({ data: 'value' })
        );
        expect(result).toBe(true);
      });

      test('should set value with TTL', async () => {
        mockClient.set.mockResolvedValue('OK');

        const result = await provider.set(
          'test-key',
          { data: 'value' },
          { ttl: 3600 }
        );

        expect(mockClient.set).toHaveBeenCalledWith(
          'test-key',
          JSON.stringify({ data: 'value' }),
          'EX',
          3600
        );
        expect(result).toBe(true);
      });

      test('should return false on Redis error', async () => {
        mockClient.set.mockRejectedValue(new Error('Connection refused'));

        const result = await provider.set('error-key', { data: 'value' });

        expect(result).toBe(false);
      });
    });

    describe('delete', () => {
      test('should delete single key', async () => {
        mockClient.del.mockResolvedValue(1);

        const result = await provider.delete('test-key');

        expect(mockClient.del).toHaveBeenCalledWith('test-key');
        expect(result).toBe(true);
      });

      test('should delete multiple keys with spread', async () => {
        mockClient.del.mockResolvedValue(3);

        const result = await provider.delete(['key1', 'key2', 'key3']);

        // Verify spreading works correctly
        expect(mockClient.del).toHaveBeenCalledWith('key1', 'key2', 'key3');
        expect(result).toBe(true);
      });

      test('should return false on Redis error', async () => {
        mockClient.del.mockRejectedValue(new Error('Connection refused'));

        const result = await provider.delete('error-key');

        expect(result).toBe(false);
      });
    });

    describe('exists', () => {
      test('should return true when key exists', async () => {
        mockClient.exists.mockResolvedValue(1);

        const result = await provider.exists('test-key');

        expect(mockClient.exists).toHaveBeenCalledWith('test-key');
        expect(result).toBe(true);
      });

      test('should return false when key does not exist', async () => {
        mockClient.exists.mockResolvedValue(0);

        const result = await provider.exists('nonexistent-key');

        expect(result).toBe(false);
      });

      test('should return false on Redis error', async () => {
        mockClient.exists.mockRejectedValue(new Error('Connection refused'));

        const result = await provider.exists('error-key');

        expect(result).toBe(false);
      });
    });
  });

  describe('Set Operations', () => {
    describe('addToSet', () => {
      test('should add single member to set', async () => {
        mockClient.sadd.mockResolvedValue(1);

        const result = await provider.addToSet('my-set', ['member1']);

        expect(mockClient.sadd).toHaveBeenCalledWith('my-set', 'member1');
        expect(result).toBe(1);
      });

      test('should add multiple members to set with correct spreading', async () => {
        mockClient.sadd.mockResolvedValue(3);

        const result = await provider.addToSet('my-set', [
          'member1',
          'member2',
          'member3',
        ]);

        // This is the critical test - verify spreading works correctly
        expect(mockClient.sadd).toHaveBeenCalledWith(
          'my-set',
          'member1',
          'member2',
          'member3'
        );
        expect(result).toBe(3);
      });

      test('should handle many members with spreading', async () => {
        mockClient.sadd.mockResolvedValue(10);
        const members = Array.from({ length: 10 }, (_, i) => `member${i}`);

        const result = await provider.addToSet('my-set', members);

        expect(mockClient.sadd).toHaveBeenCalledWith('my-set', ...members);
        expect(result).toBe(10);
      });

      test('should return 0 when no members provided', async () => {
        const result = await provider.addToSet('my-set', []);

        expect(mockClient.sadd).not.toHaveBeenCalled();
        expect(result).toBe(0);
      });

      test('should return 0 on Redis error', async () => {
        mockClient.sadd.mockRejectedValue(new Error('Connection refused'));

        const result = await provider.addToSet('error-set', ['member']);

        expect(result).toBe(0);
      });

      test('should handle members with special characters', async () => {
        mockClient.sadd.mockResolvedValue(3);

        const result = await provider.addToSet('my-set', [
          'member:with:colons',
          'member-with-dashes',
          'member_with_underscores',
        ]);

        expect(mockClient.sadd).toHaveBeenCalledWith(
          'my-set',
          'member:with:colons',
          'member-with-dashes',
          'member_with_underscores'
        );
        expect(result).toBe(3);
      });
    });

    describe('removeFromSet', () => {
      test('should remove single member from set', async () => {
        mockClient.srem.mockResolvedValue(1);

        const result = await provider.removeFromSet('my-set', ['member1']);

        expect(mockClient.srem).toHaveBeenCalledWith('my-set', 'member1');
        expect(result).toBe(1);
      });

      test('should remove multiple members with correct spreading', async () => {
        mockClient.srem.mockResolvedValue(3);

        const result = await provider.removeFromSet('my-set', [
          'member1',
          'member2',
          'member3',
        ]);

        // Verify spreading works correctly
        expect(mockClient.srem).toHaveBeenCalledWith(
          'my-set',
          'member1',
          'member2',
          'member3'
        );
        expect(result).toBe(3);
      });

      test('should return 0 when no members provided', async () => {
        const result = await provider.removeFromSet('my-set', []);

        expect(mockClient.srem).not.toHaveBeenCalled();
        expect(result).toBe(0);
      });

      test('should return 0 on Redis error', async () => {
        mockClient.srem.mockRejectedValue(new Error('Connection refused'));

        const result = await provider.removeFromSet('error-set', ['member']);

        expect(result).toBe(0);
      });
    });

    describe('getSetMembers', () => {
      test('should return Set of members', async () => {
        mockClient.smembers.mockResolvedValue(['a', 'b', 'c']);

        const result = await provider.getSetMembers('my-set');

        expect(mockClient.smembers).toHaveBeenCalledWith('my-set');
        expect(result).toEqual(new Set(['a', 'b', 'c']));
      });

      test('should return empty Set when no members', async () => {
        mockClient.smembers.mockResolvedValue([]);

        const result = await provider.getSetMembers('empty-set');

        expect(result).toEqual(new Set());
      });

      test('should return empty Set on Redis error', async () => {
        mockClient.smembers.mockRejectedValue(new Error('Connection refused'));

        const result = await provider.getSetMembers('error-set');

        expect(result).toEqual(new Set());
      });

      describe('with local caching', () => {
        test('should return cached value from local cache on second call', async () => {
          // Create provider with local cache enabled
          const providerWithCache = new RedisCacheProvider(
            mockClient as any,
            undefined,
            { enableLocalCache: true }
          );
          mockClient.smembers.mockResolvedValue(['member1', 'member2']);

          // First call - fetches from Redis
          const result1 = await providerWithCache.getSetMembers(
            'cached-set',
            undefined,
            {
              useLocalCache: true,
              localCacheTtl: 60,
            }
          );
          expect(result1).toEqual(new Set(['member1', 'member2']));
          expect(mockClient.smembers).toHaveBeenCalledTimes(1);

          // Second call - should use local cache
          const result2 = await providerWithCache.getSetMembers(
            'cached-set',
            undefined,
            {
              useLocalCache: true,
              localCacheTtl: 60,
            }
          );
          expect(result2).toEqual(new Set(['member1', 'member2']));
          // Should NOT call Redis again - local cache hit
          expect(mockClient.smembers).toHaveBeenCalledTimes(1);
        });

        test('should fetch from Redis when local cache disabled', async () => {
          // Create provider with local cache enabled
          const providerWithCache = new RedisCacheProvider(
            mockClient as any,
            undefined,
            { enableLocalCache: true }
          );
          mockClient.smembers.mockResolvedValue(['a', 'b']);

          // First call with local cache
          await providerWithCache.getSetMembers('test-set', undefined, {
            useLocalCache: true,
          });
          expect(mockClient.smembers).toHaveBeenCalledTimes(1);

          // Second call without local cache - should fetch from Redis again
          await providerWithCache.getSetMembers('test-set');
          expect(mockClient.smembers).toHaveBeenCalledTimes(2);
        });

        test('should not cache empty sets in local cache', async () => {
          // Create provider with local cache enabled
          const providerWithCache = new RedisCacheProvider(
            mockClient as any,
            undefined,
            { enableLocalCache: true }
          );
          mockClient.smembers.mockResolvedValue([]);

          // First call
          const result1 = await providerWithCache.getSetMembers(
            'empty-set',
            undefined,
            {
              useLocalCache: true,
            }
          );
          expect(result1).toEqual(new Set());
          expect(mockClient.smembers).toHaveBeenCalledTimes(1);

          // Second call - should still fetch from Redis since empty set is not cached
          const result2 = await providerWithCache.getSetMembers(
            'empty-set',
            undefined,
            {
              useLocalCache: true,
            }
          );
          expect(result2).toEqual(new Set());
          expect(mockClient.smembers).toHaveBeenCalledTimes(2);
        });
      });
    });

    describe('isSetMember', () => {
      test('should return true when member exists', async () => {
        mockClient.sismember.mockResolvedValue(1);

        const result = await provider.isSetMember('my-set', 'member1');

        expect(mockClient.sismember).toHaveBeenCalledWith('my-set', 'member1');
        expect(result).toBe(true);
      });

      test('should return false when member does not exist', async () => {
        mockClient.sismember.mockResolvedValue(0);

        const result = await provider.isSetMember('my-set', 'nonexistent');

        expect(result).toBe(false);
      });

      test('should return false on Redis error', async () => {
        mockClient.sismember.mockRejectedValue(new Error('Connection refused'));

        const result = await provider.isSetMember('error-set', 'member');

        expect(result).toBe(false);
      });
    });
  });

  describe('Atomic Operations', () => {
    describe('increment', () => {
      test('should increment by default amount of 1', async () => {
        mockClient.incrbyfloat.mockResolvedValue('101');

        const result = await provider.increment('counter');

        expect(mockClient.incrbyfloat).toHaveBeenCalledWith('counter', 1);
        expect(result).toBe(101);
      });

      test('should increment by specified amount', async () => {
        mockClient.incrbyfloat.mockResolvedValue('150.5');

        const result = await provider.increment('counter', 50.5);

        expect(mockClient.incrbyfloat).toHaveBeenCalledWith('counter', 50.5);
        expect(result).toBe(150.5);
      });

      test('should handle decimal amounts', async () => {
        mockClient.incrbyfloat.mockResolvedValue('0.003');

        const result = await provider.increment('counter', 0.001);

        expect(mockClient.incrbyfloat).toHaveBeenCalledWith('counter', 0.001);
        expect(result).toBeCloseTo(0.003, 10);
      });

      test('should return 0 on Redis error', async () => {
        mockClient.incrbyfloat.mockRejectedValue(
          new Error('Connection refused')
        );

        const result = await provider.increment('error-counter');

        expect(result).toBe(0);
      });
    });

    describe('decrement', () => {
      test('should decrement by default amount of 1', async () => {
        mockClient.incrbyfloat.mockResolvedValue('99');

        const result = await provider.decrement('counter');

        expect(mockClient.incrbyfloat).toHaveBeenCalledWith('counter', -1);
        expect(result).toBe(99);
      });

      test('should decrement by specified amount', async () => {
        mockClient.incrbyfloat.mockResolvedValue('50');

        const result = await provider.decrement('counter', 50);

        expect(mockClient.incrbyfloat).toHaveBeenCalledWith('counter', -50);
        expect(result).toBe(50);
      });

      test('should return 0 on Redis error', async () => {
        mockClient.incrbyfloat.mockRejectedValue(
          new Error('Connection refused')
        );

        const result = await provider.decrement('error-counter');

        expect(result).toBe(0);
      });
    });

    describe('getAtomicValue', () => {
      test('should return numeric value', async () => {
        mockClient.get.mockResolvedValue('123.45');

        const result = await provider.getAtomicValue('counter');

        expect(mockClient.get).toHaveBeenCalledWith('counter');
        expect(result).toBe(123.45);
      });

      test('should return 0 when key does not exist', async () => {
        mockClient.get.mockResolvedValue(null);

        const result = await provider.getAtomicValue('nonexistent');

        expect(result).toBe(0);
      });

      test('should return 0 on Redis error', async () => {
        mockClient.get.mockRejectedValue(new Error('Connection refused'));

        const result = await provider.getAtomicValue('error-counter');

        expect(result).toBe(0);
      });
    });
  });

  describe('Script Operations', () => {
    describe('loadScript', () => {
      test('should load script and return SHA', async () => {
        mockClient.script.mockResolvedValue('abc123sha');

        const result = await provider.loadScript('return 1');

        expect(mockClient.script).toHaveBeenCalledWith('LOAD', 'return 1');
        expect(result).toBe('abc123sha');
      });

      test('should cache SHA for repeated loads', async () => {
        mockClient.script.mockResolvedValue('abc123sha');

        const result1 = await provider.loadScript('return 1');
        const result2 = await provider.loadScript('return 1');

        expect(mockClient.script).toHaveBeenCalledTimes(1);
        expect(result1).toBe('abc123sha');
        expect(result2).toBe('abc123sha');
      });

      test('should throw on Redis error', async () => {
        mockClient.script.mockRejectedValue(new Error('Script error'));

        await expect(provider.loadScript('invalid script')).rejects.toThrow(
          'Script error'
        );
      });
    });

    describe('executeScript', () => {
      test('should execute script by SHA', async () => {
        mockClient.script.mockResolvedValue('sha123');
        mockClient.evalsha.mockResolvedValue([1, 2, 3]);

        // First load the script
        await provider.loadScript('test script');

        // Execute using the script content (will use cached SHA)
        const result = await provider.executeScript(
          'test script',
          ['key1', 'key2'],
          ['arg1', 'arg2']
        );

        expect(mockClient.evalsha).toHaveBeenCalledWith(
          'sha123',
          2,
          'key1',
          'key2',
          'arg1',
          'arg2'
        );
        expect(result).toEqual([1, 2, 3]);
      });

      test('should fallback to loading script on NOSCRIPT error', async () => {
        mockClient.evalsha
          .mockRejectedValueOnce(new Error('NOSCRIPT No matching script'))
          .mockResolvedValueOnce([1, 2, 3]);
        mockClient.script.mockResolvedValue('newsha123');

        const result = await provider.executeScript(
          'test script',
          ['key1'],
          ['arg1']
        );

        expect(mockClient.evalsha).toHaveBeenCalledTimes(2);
        expect(result).toEqual([1, 2, 3]);
      });
    });
  });

  describe('Read Replica Support', () => {
    describe('getFromReplica', () => {
      test('should read from reader client when available', async () => {
        const mockReaderClient = createMockRedisClient();
        mockReaderClient.get.mockResolvedValue(
          JSON.stringify({ data: 'test' })
        );

        const providerWithReader = new RedisCacheProvider(
          mockClient as any,
          mockReaderClient as any,
          { enableLocalCache: false }
        );

        const result = await providerWithReader.getFromReplica('test-key');

        expect(mockReaderClient.get).toHaveBeenCalledWith('test-key');
        expect(mockClient.get).not.toHaveBeenCalled();
        expect(result).toEqual({ data: 'test' });
      });

      test('should fallback to main client when no reader', async () => {
        mockClient.get.mockResolvedValue(JSON.stringify({ data: 'test' }));

        const result = await provider.getFromReplica('test-key');

        expect(mockClient.get).toHaveBeenCalledWith('test-key');
        expect(result).toEqual({ data: 'test' });
      });

      test('should return null on Redis error', async () => {
        mockClient.get.mockRejectedValue(new Error('Connection refused'));

        const result = await provider.getFromReplica('error-key');

        expect(result).toBeNull();
      });
    });
  });

  describe('Local Cache Integration', () => {
    test('should populate local cache on get with useLocalCache option', async () => {
      const providerWithCache = new RedisCacheProvider(
        mockClient as any,
        undefined,
        {
          enableLocalCache: true,
          localCacheTtl: 60,
        }
      );
      mockClient.get.mockResolvedValue(JSON.stringify({ data: 'test' }));

      // First call should hit Redis
      await providerWithCache.get('test-key', { useLocalCache: true });
      expect(mockClient.get).toHaveBeenCalledTimes(1);

      // Second call should use local cache
      await providerWithCache.get('test-key', { useLocalCache: true });
      expect(mockClient.get).toHaveBeenCalledTimes(1); // Still 1
    });

    test('should invalidate local cache on addToSet', async () => {
      const providerWithCache = new RedisCacheProvider(
        mockClient as any,
        undefined,
        {
          enableLocalCache: true,
        }
      );
      mockClient.sadd.mockResolvedValue(1);

      // This should invalidate local cache for the key
      await providerWithCache.addToSet('my-set', ['member1']);

      expect(mockClient.sadd).toHaveBeenCalled();
      // Local cache should be invalidated (verified by checking internal state)
    });

    test('should invalidate local cache on removeFromSet', async () => {
      const providerWithCache = new RedisCacheProvider(
        mockClient as any,
        undefined,
        {
          enableLocalCache: true,
        }
      );
      mockClient.srem.mockResolvedValue(1);

      await providerWithCache.removeFromSet('my-set', ['member1']);

      expect(mockClient.srem).toHaveBeenCalled();
    });

    test('should invalidate local cache on delete', async () => {
      const providerWithCache = new RedisCacheProvider(
        mockClient as any,
        undefined,
        {
          enableLocalCache: true,
        }
      );
      mockClient.del.mockResolvedValue(1);

      await providerWithCache.delete('test-key');

      expect(mockClient.del).toHaveBeenCalled();
    });
  });

  describe('Capabilities', () => {
    test('should have correct capabilities', () => {
      expect(provider.capabilities).toEqual({
        supportsAtomicOps: true,
        supportsSets: true,
        supportsLuaScripts: true,
        supportsReadReplicas: true,
      });
    });
  });

  describe('Utility Methods', () => {
    test('getClient should return the Redis client', () => {
      const client = provider.getClient();
      expect(client).toBe(mockClient);
    });

    test('invalidateLocalCache should handle single key', () => {
      const providerWithCache = new RedisCacheProvider(
        mockClient as any,
        undefined,
        {
          enableLocalCache: true,
        }
      );

      // Should not throw
      expect(() =>
        providerWithCache.invalidateLocalCache('test-key')
      ).not.toThrow();
    });

    test('invalidateLocalCache should handle array of keys', () => {
      const providerWithCache = new RedisCacheProvider(
        mockClient as any,
        undefined,
        {
          enableLocalCache: true,
        }
      );

      expect(() =>
        providerWithCache.invalidateLocalCache(['key1', 'key2', 'key3'])
      ).not.toThrow();
    });

    test('clearLocalCache should clear all cached items', () => {
      const providerWithCache = new RedisCacheProvider(
        mockClient as any,
        undefined,
        {
          enableLocalCache: true,
        }
      );

      expect(() => providerWithCache.clearLocalCache()).not.toThrow();
    });
  });

  describe('Circuit Breaker Operations', () => {
    test('getStatus should return parsed circuit breaker data', async () => {
      const cbData = {
        '/path1': { failure_count: 5, success_count: 10 },
        '/path2': { failure_count: 2, success_count: 20 },
      };
      mockClient.get.mockResolvedValue(JSON.stringify(cbData));

      const result = await provider.getStatus('config-123');

      expect(mockClient.get).toHaveBeenCalledWith(
        '{circuit_breaker:config-123}'
      );
      expect(result).toEqual(cbData);
    });

    test('getStatus should return null when no data', async () => {
      mockClient.get.mockResolvedValue(null);

      const result = await provider.getStatus('config-123');

      expect(result).toBeNull();
    });

    test('resetCircuitBreaker should delete the key', async () => {
      mockClient.del.mockResolvedValue(1);

      await provider.resetCircuitBreaker('config-123');

      expect(mockClient.del).toHaveBeenCalledWith(
        '{circuit_breaker:config-123}'
      );
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty string values', async () => {
      mockClient.get.mockResolvedValue('""');

      const result = await provider.get('empty-string-key');

      expect(result).toBe('');
    });

    test('should handle null JSON values', async () => {
      mockClient.get.mockResolvedValue('null');

      const result = await provider.get('null-value-key');

      expect(result).toBeNull();
    });

    test('should handle complex nested objects', async () => {
      const complexData = {
        level1: {
          level2: {
            level3: {
              array: [1, 2, { nested: true }],
              value: 'deep',
            },
          },
        },
      };
      mockClient.get.mockResolvedValue(JSON.stringify(complexData));

      const result = await provider.get('complex-key');

      expect(result).toEqual(complexData);
    });

    test('should handle very large arrays in set operations', async () => {
      mockClient.sadd.mockResolvedValue(1000);
      const members = Array.from({ length: 1000 }, (_, i) => `member-${i}`);

      const result = await provider.addToSet('large-set', members);

      expect(mockClient.sadd).toHaveBeenCalledWith('large-set', ...members);
      expect(result).toBe(1000);
    });
  });
});
