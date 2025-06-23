import { Context } from 'hono';
import { CacheService } from '../../../../../src/handlers/services/cacheService';
import { HooksService } from '../../../../../src/handlers/services/hooksService';
import { RequestContext } from '../../../../../src/handlers/services/requestContext';
import { endpointStrings } from '../../../../../src/providers/types';

// Mock HooksService
jest.mock('../hooksService');

// Mock env function
jest.mock('hono/adapter', () => ({
  env: jest.fn(() => ({})),
}));

describe('CacheService', () => {
  let mockContext: Context;
  let mockHooksService: jest.Mocked<HooksService>;
  let mockRequestContext: RequestContext;
  let cacheService: CacheService;

  beforeEach(() => {
    mockContext = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as Context;

    mockHooksService = {
      results: {
        beforeRequestHooksResult: [],
        afterRequestHooksResult: [],
      },
      hasFailedHooks: jest.fn(),
    } as unknown as jest.Mocked<HooksService>;

    mockRequestContext = {
      endpoint: 'chatComplete' as endpointStrings,
      honoContext: mockContext,
      requestHeaders: {},
      transformedRequestBody: { message: 'test' },
      cacheConfig: {
        mode: 'simple',
        maxAge: 3600,
      },
    } as unknown as RequestContext;

    cacheService = new CacheService(mockContext, mockHooksService);
  });

  describe('isEndpointCacheable', () => {
    it('should return true for cacheable endpoints', () => {
      expect(cacheService.isEndpointCacheable('chatComplete')).toBe(true);
      expect(cacheService.isEndpointCacheable('complete')).toBe(true);
      expect(cacheService.isEndpointCacheable('embed')).toBe(true);
      expect(cacheService.isEndpointCacheable('imageGenerate')).toBe(true);
    });

    it('should return false for non-cacheable endpoints', () => {
      expect(cacheService.isEndpointCacheable('uploadFile')).toBe(false);
      expect(cacheService.isEndpointCacheable('listFiles')).toBe(false);
      expect(cacheService.isEndpointCacheable('retrieveFile')).toBe(false);
      expect(cacheService.isEndpointCacheable('deleteFile')).toBe(false);
      expect(cacheService.isEndpointCacheable('createBatch')).toBe(false);
      expect(cacheService.isEndpointCacheable('retrieveBatch')).toBe(false);
      expect(cacheService.isEndpointCacheable('cancelBatch')).toBe(false);
      expect(cacheService.isEndpointCacheable('listBatches')).toBe(false);
      expect(cacheService.isEndpointCacheable('getBatchOutput')).toBe(false);
      expect(cacheService.isEndpointCacheable('listFinetunes')).toBe(false);
      expect(cacheService.isEndpointCacheable('createFinetune')).toBe(false);
      expect(cacheService.isEndpointCacheable('retrieveFinetune')).toBe(false);
      expect(cacheService.isEndpointCacheable('cancelFinetune')).toBe(false);
    });
  });

  describe('getFromCacheFunction', () => {
    it('should return cache function from context', () => {
      const mockCacheFunction = jest.fn();
      (mockContext.get as jest.Mock).mockReturnValue(mockCacheFunction);

      expect(cacheService.getFromCacheFunction).toBe(mockCacheFunction);
      expect(mockContext.get).toHaveBeenCalledWith('getFromCache');
    });

    it('should return undefined if no cache function', () => {
      (mockContext.get as jest.Mock).mockReturnValue(undefined);

      expect(cacheService.getFromCacheFunction).toBeUndefined();
    });
  });

  describe('getCacheIdentifier', () => {
    it('should return cache identifier from context', () => {
      const mockIdentifier = 'cache-id-123';
      (mockContext.get as jest.Mock).mockReturnValue(mockIdentifier);

      expect(cacheService.getCacheIdentifier).toBe(mockIdentifier);
      expect(mockContext.get).toHaveBeenCalledWith('cacheIdentifier');
    });
  });

  describe('noCacheObject', () => {
    it('should return default no-cache object', () => {
      const result = cacheService.noCacheObject;

      expect(result).toEqual({
        cacheResponse: undefined,
        cacheStatus: 'DISABLED',
        cacheKey: undefined,
        createdAt: expect.any(Date),
      });
    });
  });

  describe('getCachedResponse', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return no-cache object for non-cacheable endpoints', async () => {
      const context = {
        ...mockRequestContext,
        endpoint: 'uploadFile' as endpointStrings,
      } as RequestContext;

      const result = await cacheService.getCachedResponse(context, {});

      expect(result).toEqual({
        cacheResponse: undefined,
        cacheStatus: 'DISABLED',
        cacheKey: undefined,
        createdAt: expect.any(Date),
      });
    });

    it('should return no-cache object when cache function is not available', async () => {
      (mockContext.get as jest.Mock).mockReturnValue(undefined);

      const result = await cacheService.getCachedResponse(
        mockRequestContext,
        {}
      );

      expect(result).toEqual({
        cacheResponse: undefined,
        cacheStatus: 'DISABLED',
        cacheKey: undefined,
        createdAt: expect.any(Date),
      });
    });

    it('should return no-cache object when cache mode is not set', async () => {
      const context = {
        ...mockRequestContext,
        cacheConfig: { mode: undefined, maxAge: undefined },
      } as unknown as RequestContext;

      const result = await cacheService.getCachedResponse(context, {});

      expect(result).toEqual({
        cacheResponse: undefined,
        cacheStatus: 'DISABLED',
        cacheKey: undefined,
        createdAt: expect.any(Date),
      });
    });

    it('should return cache response when cache hit', async () => {
      const mockCacheFunction = jest
        .fn()
        .mockResolvedValue([
          '{"choices": [{"message": {"content": "cached response"}}]}',
          'HIT',
          'cache-key-123',
        ]);
      (mockContext.get as jest.Mock).mockImplementation((key: string) => {
        if (key === 'getFromCache') return mockCacheFunction;
        if (key === 'cacheIdentifier') return 'cache-identifier';
        return undefined;
      });

      const result = await cacheService.getCachedResponse(
        mockRequestContext,
        {}
      );

      expect(result.cacheResponse).toBeInstanceOf(Response);
      expect(result.cacheStatus).toBe('HIT');
      expect(result.cacheKey).toBe('cache-key-123');
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('should return cache miss when no cached response', async () => {
      const mockCacheFunction = jest
        .fn()
        .mockResolvedValue([null, 'MISS', 'cache-key-123']);
      (mockContext.get as jest.Mock).mockImplementation((key: string) => {
        if (key === 'getFromCache') return mockCacheFunction;
        if (key === 'cacheIdentifier') return 'cache-identifier';
        return undefined;
      });

      const result = await cacheService.getCachedResponse(
        mockRequestContext,
        {}
      );

      expect(result.cacheResponse).toBeUndefined();
      expect(result.cacheStatus).toBe('MISS');
      expect(result.cacheKey).toBe('cache-key-123');
    });

    it('should include hook results in cached response when available', async () => {
      const mockHookResults = [
        { id: 'hook1', verdict: true },
        { id: 'hook2', verdict: false },
      ];
      Object.defineProperty(mockHooksService, 'results', {
        value: {
          beforeRequestHooksResult: mockHookResults,
          afterRequestHooksResult: [],
        },
        writable: true,
      });
      mockHooksService.hasFailedHooks.mockReturnValue(true);

      const mockCacheFunction = jest
        .fn()
        .mockResolvedValue([
          '{"choices": [{"message": {"content": "cached response"}}]}',
          'HIT',
          'cache-key-123',
        ]);
      (mockContext.get as jest.Mock).mockImplementation((key: string) => {
        if (key === 'getFromCache') return mockCacheFunction;
        if (key === 'cacheIdentifier') return 'cache-identifier';
        return undefined;
      });

      const result = await cacheService.getCachedResponse(
        mockRequestContext,
        {}
      );

      expect(result.cacheResponse).toBeInstanceOf(Response);
      expect(result.cacheResponse!.status).toBe(246); // Failed hooks status

      const responseBody = await result.cacheResponse!.json();
      expect(responseBody).toHaveProperty('hook_results');
      expect((responseBody as any).hook_results.before_request_hooks).toEqual(
        mockHookResults
      );
    });

    it('should return status 200 when no failed hooks', async () => {
      const mockHookResults = [
        { id: 'hook1', verdict: true },
        { id: 'hook2', verdict: true },
      ];
      Object.defineProperty(mockHooksService, 'results', {
        value: {
          beforeRequestHooksResult: mockHookResults,
          afterRequestHooksResult: [],
        },
        writable: true,
      });
      mockHooksService.hasFailedHooks.mockReturnValue(false);

      const mockCacheFunction = jest
        .fn()
        .mockResolvedValue([
          '{"choices": [{"message": {"content": "cached response"}}]}',
          'HIT',
          'cache-key-123',
        ]);
      (mockContext.get as jest.Mock).mockImplementation((key: string) => {
        if (key === 'getFromCache') return mockCacheFunction;
        if (key === 'cacheIdentifier') return 'cache-identifier';
        return undefined;
      });

      const result = await cacheService.getCachedResponse(
        mockRequestContext,
        {}
      );

      expect(result.cacheResponse!.status).toBe(200);
    });

    it('should handle cache function parameters correctly', async () => {
      const mockCacheFunction = jest
        .fn()
        .mockResolvedValue([null, 'MISS', null]);
      (mockContext.get as jest.Mock).mockImplementation((key: string) => {
        if (key === 'getFromCache') return mockCacheFunction;
        if (key === 'cacheIdentifier') return 'cache-identifier';
        return undefined;
      });

      const headers = { authorization: 'Bearer test' };
      await cacheService.getCachedResponse(mockRequestContext, headers);

      expect(mockCacheFunction).toHaveBeenCalledWith(
        {}, // env result
        { ...mockRequestContext.requestHeaders, ...headers },
        mockRequestContext.transformedRequestBody,
        mockRequestContext.endpoint,
        'cache-identifier',
        'simple',
        3600
      );
    });

    it('should handle undefined cache status and key', async () => {
      const mockCacheFunction = jest
        .fn()
        .mockResolvedValue([null, undefined, undefined]);
      (mockContext.get as jest.Mock).mockImplementation((key: string) => {
        if (key === 'getFromCache') return mockCacheFunction;
        if (key === 'cacheIdentifier') return 'cache-identifier';
        return undefined;
      });

      const result = await cacheService.getCachedResponse(
        mockRequestContext,
        {}
      );

      expect(result.cacheStatus).toBe('DISABLED');
      expect(result.cacheKey).toBeUndefined();
    });

    it('should handle empty cache key', async () => {
      const mockCacheFunction = jest.fn().mockResolvedValue([null, 'MISS', '']);
      (mockContext.get as jest.Mock).mockImplementation((key: string) => {
        if (key === 'getFromCache') return mockCacheFunction;
        if (key === 'cacheIdentifier') return 'cache-identifier';
        return undefined;
      });

      const result = await cacheService.getCachedResponse(
        mockRequestContext,
        {}
      );

      expect(result.cacheKey).toBeUndefined();
    });
  });
});
