import {
  parseValkeyConnectionString,
  createValkeyClient,
} from '../../../../../../src/shared/services/valkey/client';
import { createCacheBackendsValkey } from '../../../../../../src/shared/services/cache/index';

jest.mock('@valkey/valkey-glide', () => ({
  GlideClient: {
    createClient: jest.fn().mockResolvedValue({ type: 'standalone' }),
  },
  GlideClusterClient: {
    createClient: jest.fn().mockResolvedValue({ type: 'cluster' }),
  },
}));

jest.mock(
  '../../../../../../src/shared/services/cache/backends/valkey',
  () => ({
    createValkeyBackend: jest.fn().mockReturnValue({ type: 'mockBackend' }),
  })
);

describe('parseValkeyConnectionString', () => {
  describe('valid connection strings', () => {
    it('should parse valkey:// scheme', () => {
      const result = parseValkeyConnectionString('valkey://myhost:6380');
      expect(result.addresses).toEqual([{ host: 'myhost', port: 6380 }]);
      expect(result.options.useTLS).toBe(false);
    });

    it('should parse valkeys:// scheme with TLS', () => {
      const result = parseValkeyConnectionString('valkeys://secure:7777');
      expect(result.addresses).toEqual([{ host: 'secure', port: 7777 }]);
      expect(result.options.useTLS).toBe(true);
    });

    it('should parse redis:// compat scheme', () => {
      const result = parseValkeyConnectionString('redis://compat:6379');
      expect(result.addresses[0].host).toBe('compat');
      expect(result.options.useTLS).toBe(false);
    });

    it('should parse rediss:// scheme with TLS', () => {
      const result = parseValkeyConnectionString('rediss://tlshost:6380');
      expect(result.options.useTLS).toBe(true);
    });

    it('should extract password from URL', () => {
      const result = parseValkeyConnectionString(
        'valkey://:secret123@myhost:6379'
      );
      expect(result.options.password).toBe('secret123');
    });

    it('should decode URL-encoded password', () => {
      const result = parseValkeyConnectionString(
        'valkey://:p%40ss%3Dword@host:6379'
      );
      expect(result.options.password).toBe('p@ss=word');
    });

    it('should default port to 6379 when omitted', () => {
      const result = parseValkeyConnectionString('valkey://noport');
      expect(result.addresses[0].port).toBe(6379);
    });

    it('should not set password when none provided', () => {
      const result = parseValkeyConnectionString('valkey://host:6379');
      expect(result.options.password).toBeUndefined();
    });

    it('should parse multi-seed cluster URL', () => {
      const result = parseValkeyConnectionString(
        'valkey://host1:6379,host2:6380,host3:6381?cluster=true'
      );
      expect(result.addresses).toEqual([
        { host: 'host1', port: 6379 },
        { host: 'host2', port: 6380 },
        { host: 'host3', port: 6381 },
      ]);
      expect(result.options.cluster).toBe(true);
    });

    it('should parse multi-seed with password', () => {
      const result = parseValkeyConnectionString(
        'valkeys://:secret@host1:6379,host2:6380?cluster=true'
      );
      expect(result.addresses).toEqual([
        { host: 'host1', port: 6379 },
        { host: 'host2', port: 6380 },
      ]);
      expect(result.options.password).toBe('secret');
      expect(result.options.useTLS).toBe(true);
    });
  });

  describe('invalid connection strings', () => {
    it('should reject unsupported schemes', () => {
      expect(() => parseValkeyConnectionString('http://bad:1234')).toThrow(
        /Unsupported scheme/
      );
    });

    it('should reject malformed URLs', () => {
      expect(() => parseValkeyConnectionString('not a url')).toThrow(
        /Invalid Valkey connection string/
      );
    });

    it('should reject empty string', () => {
      expect(() => parseValkeyConnectionString('')).toThrow();
    });
  });
});

// --- cluster query param tests (appended to parseValkeyConnectionString suite) ---
describe('parseValkeyConnectionString cluster param', () => {
  it('cluster=true sets options.cluster = true', () => {
    const result = parseValkeyConnectionString(
      'valkey://host:6379?cluster=true'
    );
    expect(result.options.cluster).toBe(true);
  });

  it('cluster=false does not set options.cluster', () => {
    const result = parseValkeyConnectionString(
      'valkey://host:6379?cluster=false'
    );
    expect(result.options.cluster).toBeUndefined();
  });

  it('no cluster param leaves options.cluster undefined', () => {
    const result = parseValkeyConnectionString('valkey://host:6379');
    expect(result.options.cluster).toBeUndefined();
  });

  it('multi-seed single-address still returns one-element addresses array', () => {
    const result = parseValkeyConnectionString(
      'valkey://host:6379?cluster=true'
    );
    expect(result.addresses).toHaveLength(1);
    expect(result.addresses[0]).toEqual({ host: 'host', port: 6379 });
  });
});

describe('createValkeyClient', () => {
  const { GlideClient, GlideClusterClient } = jest.requireMock(
    '@valkey/valkey-glide'
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls GlideClient.createClient when cluster is undefined', async () => {
    await createValkeyClient([{ host: 'localhost', port: 6379 }]);
    expect(GlideClient.createClient).toHaveBeenCalledTimes(1);
    expect(GlideClusterClient.createClient).not.toHaveBeenCalled();
  });

  it('calls GlideClient.createClient when cluster is false', async () => {
    await createValkeyClient([{ host: 'localhost', port: 6379 }], {
      cluster: false,
    });
    expect(GlideClient.createClient).toHaveBeenCalledTimes(1);
    expect(GlideClusterClient.createClient).not.toHaveBeenCalled();
  });

  it('calls GlideClusterClient.createClient when cluster is true', async () => {
    await createValkeyClient([{ host: 'localhost', port: 6379 }], {
      cluster: true,
    });
    expect(GlideClusterClient.createClient).toHaveBeenCalledTimes(1);
    expect(GlideClient.createClient).not.toHaveBeenCalled();
  });

  it('passes all seed addresses to GlideClusterClient', async () => {
    const addresses = [
      { host: 'node1', port: 6379 },
      { host: 'node2', port: 6380 },
    ];
    await createValkeyClient(addresses, { cluster: true });
    expect(GlideClusterClient.createClient).toHaveBeenCalledWith(
      expect.objectContaining({ addresses })
    );
  });
});

describe('createCacheBackendsValkey TTL env vars', () => {
  const VALKEY_URL = 'valkey://localhost:6379';

  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.VALKEY_DEFAULT_TTL_MS;
    delete process.env.VALKEY_SESSION_TTL_MS;
    delete process.env.VALKEY_CONFIG_TTL_MS;
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses default TTLs when no env vars set', async () => {
    await createCacheBackendsValkey(VALKEY_URL);
    const { getDefaultCache, getSessionCache, getConfigCache } = await import(
      '../../../../../../src/shared/services/cache/index'
    );
    expect((getDefaultCache() as any).defaultTtl).toBe(300000); // 5 min
    expect((getSessionCache() as any).defaultTtl).toBe(1800000); // 30 min
    expect((getConfigCache() as any).defaultTtl).toBe(2592000000); // 30 days
  });

  it('VALKEY_DEFAULT_TTL_MS overrides defaultCache TTL', async () => {
    process.env.VALKEY_DEFAULT_TTL_MS = '60000';
    await createCacheBackendsValkey(VALKEY_URL);
    const { getDefaultCache } = await import(
      '../../../../../../src/shared/services/cache/index'
    );
    expect((getDefaultCache() as any).defaultTtl).toBe(60000);
  });

  it('VALKEY_SESSION_TTL_MS overrides sessionCache TTL', async () => {
    process.env.VALKEY_SESSION_TTL_MS = '120000';
    await createCacheBackendsValkey(VALKEY_URL);
    const { getSessionCache } = await import(
      '../../../../../../src/shared/services/cache/index'
    );
    expect((getSessionCache() as any).defaultTtl).toBe(120000);
  });

  it('VALKEY_CONFIG_TTL_MS overrides configCache TTL', async () => {
    process.env.VALKEY_CONFIG_TTL_MS = '3600000';
    await createCacheBackendsValkey(VALKEY_URL);
    const { getConfigCache } = await import(
      '../../../../../../src/shared/services/cache/index'
    );
    expect((getConfigCache() as any).defaultTtl).toBe(3600000);
  });

  it('VALKEY_DEFAULT_TTL_MS=0 falls back to default 5 minutes', async () => {
    process.env.VALKEY_DEFAULT_TTL_MS = '0';
    await createCacheBackendsValkey(VALKEY_URL);
    const { getDefaultCache } = await import(
      '../../../../../../src/shared/services/cache/index'
    );
    expect((getDefaultCache() as any).defaultTtl).toBe(300000);
  });

  it('VALKEY_DEFAULT_TTL_MS=abc (NaN) falls back to default 5 minutes', async () => {
    process.env.VALKEY_DEFAULT_TTL_MS = 'abc';
    await createCacheBackendsValkey(VALKEY_URL);
    const { getDefaultCache } = await import(
      '../../../../../../src/shared/services/cache/index'
    );
    expect((getDefaultCache() as any).defaultTtl).toBe(300000);
  });
});
