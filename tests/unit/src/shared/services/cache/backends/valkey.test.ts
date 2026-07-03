import { TimeUnit } from '@valkey/valkey-glide';
import { ValkeyCacheBackend } from '../../../../../../../src/shared/services/cache/backends/valkey';
import { CacheEntry } from '../../../../../../../src/shared/services/cache/types';

// Mock GlideClient methods
const mockClient = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  scan: jest.fn(),
  close: jest.fn(),
};

// Make instanceof GlideClusterClient return false (standalone path)
jest.mock('@valkey/valkey-glide', () => {
  const actual = jest.requireActual('@valkey/valkey-glide');
  return {
    ...actual,
    GlideClusterClient: class GlideClusterClient {},
  };
});

describe('ValkeyCacheBackend', () => {
  let backend: ValkeyCacheBackend;
  const DB = 'testdb';

  beforeEach(() => {
    jest.resetAllMocks();
    mockClient.scan.mockResolvedValue(['0', []]);
    backend = new ValkeyCacheBackend(mockClient as any, DB);
  });

  describe('getFullKey', () => {
    it('prefixes with dbName:namespace: when namespace given', () => {
      expect(backend.getFullKey('k', 'ns')).toBe('testdb:ns:k');
    });

    it('prefixes with dbName:default: when no namespace', () => {
      expect(backend.getFullKey('k')).toBe('testdb:default:k');
    });
  });

  describe('get', () => {
    it('returns null on cache miss', async () => {
      mockClient.get.mockResolvedValue(null);
      expect(await backend.get('k')).toBeNull();
    });

    it('returns entry on cache hit', async () => {
      const entry: CacheEntry<string> = { value: 'v', createdAt: Date.now() };
      mockClient.get.mockResolvedValue(JSON.stringify(entry));
      const result = await backend.get<string>('k');
      expect(result?.value).toBe('v');
    });

    it('deletes and returns null for expired entry', async () => {
      const entry: CacheEntry<string> = {
        value: 'v',
        createdAt: Date.now() - 2000,
        expiresAt: Date.now() - 1000,
      };
      mockClient.get.mockResolvedValue(JSON.stringify(entry));
      mockClient.del.mockResolvedValue(1);
      expect(await backend.get('k')).toBeNull();
      expect(mockClient.del).toHaveBeenCalledWith(['testdb:default:k']);
    });

    it('returns null on client error without throwing', async () => {
      mockClient.get.mockRejectedValue(new Error('connection lost'));
      expect(await backend.get('k')).toBeNull();
    });
  });

  describe('set', () => {
    it('calls client.set without expiry when no TTL', async () => {
      mockClient.set.mockResolvedValue('OK');
      await backend.set('k', 'v');
      expect(mockClient.set).toHaveBeenCalledTimes(1);
      const [, , opts] = mockClient.set.mock.calls[0];
      expect(opts).toBeUndefined();
    });

    it('calls client.set with expiry struct when TTL given', async () => {
      mockClient.set.mockResolvedValue('OK');
      await backend.set('k', 'v', { ttl: 5000 });
      const [, , opts] = mockClient.set.mock.calls[0];
      expect(opts).toEqual({ expiry: { type: TimeUnit.Seconds, count: 5 } });
    });

    it('rethrows on client error', async () => {
      mockClient.set.mockRejectedValue(new Error('write fail'));
      await expect(backend.set('k', 'v')).rejects.toThrow('write fail');
    });
  });

  describe('delete', () => {
    it('returns true when key was deleted', async () => {
      mockClient.del.mockResolvedValue(1);
      expect(await backend.delete('k')).toBe(true);
      expect(mockClient.del).toHaveBeenCalledWith(['testdb:default:k']);
    });

    it('returns false when key was absent', async () => {
      mockClient.del.mockResolvedValue(0);
      expect(await backend.delete('k')).toBe(false);
    });
  });

  describe('has', () => {
    it('returns true when key exists', async () => {
      mockClient.exists.mockResolvedValue(1);
      expect(await backend.has('k')).toBe(true);
      expect(mockClient.exists).toHaveBeenCalledWith(['testdb:default:k']);
    });

    it('returns false when key absent', async () => {
      mockClient.exists.mockResolvedValue(0);
      expect(await backend.has('k')).toBe(false);
    });
  });

  describe('clear', () => {
    it('scans then deletes matched keys', async () => {
      mockClient.scan
        .mockResolvedValueOnce(['0', ['testdb:ns:a', 'testdb:ns:b']])
        .mockResolvedValueOnce(['0', []]);
      mockClient.del.mockResolvedValue(2);
      await backend.clear('ns');
      expect(mockClient.del).toHaveBeenCalledWith([
        'testdb:ns:a',
        'testdb:ns:b',
      ]);
    });
  });

  describe('keys', () => {
    it('returns keys stripped of dbName:namespace: prefix', async () => {
      mockClient.scan
        .mockResolvedValueOnce(['0', ['testdb:ns:foo', 'testdb:ns:bar']])
        .mockResolvedValueOnce(['0', []]);
      const result = await backend.keys('ns');
      expect(result).toEqual(['foo', 'bar']);
    });
  });
});
