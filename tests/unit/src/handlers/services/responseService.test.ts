import { ResponseService } from '../../../../../src/handlers/services/responseService';
import { RequestContext } from '../../../../../src/handlers/services/requestContext';
import { ProviderContext } from '../../../../../src/handlers/services/providerContext';
import { HooksService } from '../../../../../src/handlers/services/hooksService';
import { LogsService } from '../../../../../src/handlers/services/logsService';
import { responseHandler } from '../../../../../src/handlers/responseHandlers';
import { getRuntimeKey } from 'hono/adapter';
import {
  RESPONSE_HEADER_KEYS,
  HEADER_KEYS,
  POWERED_BY,
} from '../../../../../src/globals';

// Mock dependencies
jest.mock('../../responseHandlers');
jest.mock('hono/adapter');

describe('ResponseService', () => {
  let mockRequestContext: RequestContext;
  let mockProviderContext: ProviderContext;
  let mockHooksService: HooksService;
  let mockLogsService: LogsService;
  let responseService: ResponseService;

  beforeEach(() => {
    mockRequestContext = {
      index: 0,
      traceId: 'trace-123',
      provider: 'openai',
      isStreaming: false,
      params: { model: 'gpt-4', messages: [] },
      strictOpenAiCompliance: true,
      requestURL: 'https://api.openai.com/v1/chat/completions',
      honoContext: {
        req: { url: 'https://gateway.com/v1/chat/completions' },
      },
    } as unknown as RequestContext;

    mockProviderContext = {} as ProviderContext;

    mockHooksService = {
      areSyncHooksAvailable: false,
    } as unknown as HooksService;

    mockLogsService = {} as LogsService;

    responseService = new ResponseService(
      mockRequestContext,
      mockProviderContext,
      mockHooksService,
      mockLogsService
    );

    // Reset mocks
    jest.clearAllMocks();
    (getRuntimeKey as jest.Mock).mockReturnValue('node');
  });

  describe('create', () => {
    let mockResponse: Response;

    beforeEach(() => {
      mockResponse = new Response(
        JSON.stringify({ choices: [{ message: { content: 'Hello' } }] }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'content-encoding': 'gzip',
            'content-length': '100',
            'transfer-encoding': 'chunked',
          },
        }
      );
    });

    it('should create response for already mapped response', async () => {
      const options = {
        response: mockResponse,
        responseTransformer: undefined,
        isResponseAlreadyMapped: true,
        cache: {
          isCacheHit: false,
          cacheStatus: 'MISS',
          cacheKey: 'cache-key-123',
        },
        retryAttempt: 0,
        originalResponseJson: { choices: [{ message: { content: 'Hello' } }] },
      };

      const result = await responseService.create(options);

      expect(result.response).toBe(mockResponse);
      expect(result.originalResponseJson).toEqual({
        choices: [{ message: { content: 'Hello' } }],
      });

      // Check headers were updated
      expect(
        mockResponse.headers.get(RESPONSE_HEADER_KEYS.LAST_USED_OPTION_INDEX)
      ).toBe('0');
      expect(mockResponse.headers.get(RESPONSE_HEADER_KEYS.TRACE_ID)).toBe(
        'trace-123'
      );
      expect(
        mockResponse.headers.get(RESPONSE_HEADER_KEYS.RETRY_ATTEMPT_COUNT)
      ).toBe('0');
      expect(mockResponse.headers.get(HEADER_KEYS.PROVIDER)).toBe('openai');
    });

    it('should create response for non-mapped response', async () => {
      const mappedResponse = new Response('{"mapped": true}', { status: 200 });
      const originalJson = { original: true };
      const responseJson = { response: true };

      (responseHandler as jest.Mock).mockResolvedValue({
        response: mappedResponse,
        originalResponseJson: originalJson,
        responseJson: responseJson,
      });

      const options = {
        response: mockResponse,
        responseTransformer: 'chatComplete',
        isResponseAlreadyMapped: false,
        cache: {
          isCacheHit: false,
          cacheStatus: 'MISS',
          cacheKey: undefined,
        },
        retryAttempt: 1,
      };

      const result = await responseService.create(options);

      expect(responseHandler).toHaveBeenCalledWith(
        mockResponse,
        mockRequestContext.isStreaming,
        mockRequestContext.provider,
        'chatComplete',
        mockRequestContext.requestURL,
        false,
        mockRequestContext.params,
        mockRequestContext.strictOpenAiCompliance,
        mockRequestContext.honoContext.req.url,
        mockHooksService.areSyncHooksAvailable
      );

      expect(result.response).toEqual(mockResponse);
      expect(result.responseJson).toBe(responseJson);
      expect(result.originalResponseJson).toBe(originalJson);
    });

    it('should handle cache hit scenario', async () => {
      const options = {
        response: mockResponse,
        responseTransformer: 'chatComplete',
        isResponseAlreadyMapped: false,
        cache: {
          isCacheHit: true,
          cacheStatus: 'HIT',
          cacheKey: 'cache-key-456',
        },
        retryAttempt: 0,
      };

      (responseHandler as jest.Mock).mockResolvedValue({
        response: mockResponse,
        originalResponseJson: null,
        responseJson: null,
      });

      const result = await responseService.create(options);

      expect(responseHandler).toHaveBeenCalledWith(
        mockResponse,
        mockRequestContext.isStreaming,
        mockRequestContext.provider,
        'chatComplete',
        mockRequestContext.requestURL,
        true, // isCacheHit should be true
        mockRequestContext.params,
        mockRequestContext.strictOpenAiCompliance,
        mockRequestContext.honoContext.req.url,
        mockHooksService.areSyncHooksAvailable
      );

      expect(mockResponse.headers.get(RESPONSE_HEADER_KEYS.CACHE_STATUS)).toBe(
        'HIT'
      );
    });

    it('should throw error for non-ok response', async () => {
      const errorResponse = new Response('{"error": "Bad Request"}', {
        status: 400,
      });
      const options = {
        response: errorResponse,
        responseTransformer: undefined,
        isResponseAlreadyMapped: true,
        cache: {
          isCacheHit: false,
          cacheStatus: 'MISS',
          cacheKey: undefined,
        },
        retryAttempt: 0,
      };

      await expect(responseService.create(options)).rejects.toThrow();
    });

    it('should handle error response correctly', async () => {
      const errorResponse = new Response('{"error": "Internal Server Error"}', {
        status: 500,
      });
      const options = {
        response: errorResponse,
        responseTransformer: undefined,
        isResponseAlreadyMapped: true,
        cache: {
          isCacheHit: false,
          cacheStatus: 'MISS',
          cacheKey: undefined,
        },
        retryAttempt: 0,
      };

      try {
        await responseService.create(options);
      } catch (error: any) {
        expect(error.status).toBe(500);
        expect(error.response).toBe(errorResponse);
        expect(error.message).toBe('{"error": "Internal Server Error"}');
      }
    });

    it('should not add cache status header when not provided', async () => {
      const options = {
        response: mockResponse,
        responseTransformer: undefined,
        isResponseAlreadyMapped: true,
        cache: {
          isCacheHit: false,
          cacheStatus: undefined,
          cacheKey: undefined,
        },
        retryAttempt: 0,
      };

      await responseService.create(options);

      expect(
        mockResponse.headers.get(RESPONSE_HEADER_KEYS.CACHE_STATUS)
      ).toBeNull();
    });

    it('should not add provider header when provider is POWERED_BY', async () => {
      const contextWithPortkey = {
        ...mockRequestContext,
        provider: POWERED_BY,
      } as RequestContext;

      const serviceWithPortkey = new ResponseService(
        contextWithPortkey,
        mockProviderContext,
        mockHooksService,
        mockLogsService
      );

      const options = {
        response: mockResponse,
        responseTransformer: undefined,
        isResponseAlreadyMapped: true,
        cache: {
          isCacheHit: false,
          cacheStatus: 'MISS',
          cacheKey: undefined,
        },
        retryAttempt: 0,
      };

      await serviceWithPortkey.create(options);

      expect(mockResponse.headers.get(HEADER_KEYS.PROVIDER)).toBeNull();
    });
  });

  describe('getResponse', () => {
    it('should call responseHandler with correct parameters', async () => {
      const mockResponse = new Response('{}');
      const expectedResult = {
        response: mockResponse,
        originalResponseJson: { test: true },
        responseJson: { response: true },
      };

      (responseHandler as jest.Mock).mockResolvedValue(expectedResult);

      const result = await responseService.getResponse(
        mockResponse,
        'chatComplete',
        false
      );

      expect(responseHandler).toHaveBeenCalledWith(
        mockResponse,
        mockRequestContext.isStreaming,
        mockRequestContext.provider,
        'chatComplete',
        mockRequestContext.requestURL,
        false,
        mockRequestContext.params,
        mockRequestContext.strictOpenAiCompliance,
        mockRequestContext.honoContext.req.url,
        mockHooksService.areSyncHooksAvailable
      );

      expect(result).toBe(expectedResult);
    });

    it('should handle streaming responses', async () => {
      const streamingContext = {
        ...mockRequestContext,
        isStreaming: true,
      } as RequestContext;

      const streamingService = new ResponseService(
        streamingContext,
        mockProviderContext,
        mockHooksService,
        mockLogsService
      );

      const mockResponse = new Response('{}');
      (responseHandler as jest.Mock).mockResolvedValue({
        response: mockResponse,
        originalResponseJson: null,
        responseJson: null,
      });

      await streamingService.getResponse(mockResponse, 'chatComplete', false);

      expect(responseHandler).toHaveBeenCalledWith(
        mockResponse,
        true, // isStreaming should be true
        streamingContext.provider,
        'chatComplete',
        streamingContext.requestURL,
        false,
        streamingContext.params,
        streamingContext.strictOpenAiCompliance,
        streamingContext.honoContext.req.url,
        mockHooksService.areSyncHooksAvailable
      );
    });

    it('should handle cache hit scenario', async () => {
      const mockResponse = new Response('{}');
      (responseHandler as jest.Mock).mockResolvedValue({
        response: mockResponse,
        originalResponseJson: null,
        responseJson: null,
      });

      await responseService.getResponse(mockResponse, 'chatComplete', true);

      expect(responseHandler).toHaveBeenCalledWith(
        mockResponse,
        mockRequestContext.isStreaming,
        mockRequestContext.provider,
        'chatComplete',
        mockRequestContext.requestURL,
        true, // isCacheHit should be true
        mockRequestContext.params,
        mockRequestContext.strictOpenAiCompliance,
        mockRequestContext.honoContext.req.url,
        mockHooksService.areSyncHooksAvailable
      );
    });
  });

  describe('updateHeaders', () => {
    let mockResponse: Response;

    beforeEach(() => {
      mockResponse = new Response('{}', {
        headers: {
          'content-encoding': 'br, gzip',
          'content-length': '100',
          'transfer-encoding': 'chunked',
        },
      });
    });

    it('should add required headers', () => {
      responseService.updateHeaders(mockResponse, 'HIT', 2);

      expect(
        mockResponse.headers.get(RESPONSE_HEADER_KEYS.LAST_USED_OPTION_INDEX)
      ).toBe('0');
      expect(mockResponse.headers.get(RESPONSE_HEADER_KEYS.TRACE_ID)).toBe(
        'trace-123'
      );
      expect(
        mockResponse.headers.get(RESPONSE_HEADER_KEYS.RETRY_ATTEMPT_COUNT)
      ).toBe('2');
      expect(mockResponse.headers.get(RESPONSE_HEADER_KEYS.CACHE_STATUS)).toBe(
        'HIT'
      );
      expect(mockResponse.headers.get(HEADER_KEYS.PROVIDER)).toBe('openai');
    });

    it('should remove problematic headers', () => {
      responseService.updateHeaders(mockResponse, undefined, 0);

      expect(mockResponse.headers.get('content-length')).toBeNull();
      expect(mockResponse.headers.get('transfer-encoding')).toBeNull();
    });

    it('should remove brotli encoding', () => {
      responseService.updateHeaders(mockResponse, undefined, 0);

      expect(mockResponse.headers.get('content-encoding')).toBeNull();
    });

    it('should remove content-encoding for node runtime', () => {
      (getRuntimeKey as jest.Mock).mockReturnValue('node');
      const response = new Response('{}', {
        headers: { 'content-encoding': 'gzip' },
      });

      responseService.updateHeaders(response, undefined, 0);

      expect(response.headers.get('content-encoding')).toBeNull();
    });

    it('should keep content-encoding for non-brotli, non-node', () => {
      (getRuntimeKey as jest.Mock).mockReturnValue('workerd');
      const response = new Response('{}', {
        headers: { 'content-encoding': 'gzip' },
      });

      responseService.updateHeaders(response, undefined, 0);

      expect(response.headers.get('content-encoding')).toBe('gzip');
    });

    it('should not add cache status header when undefined', () => {
      responseService.updateHeaders(mockResponse, undefined, 0);

      expect(
        mockResponse.headers.get(RESPONSE_HEADER_KEYS.CACHE_STATUS)
      ).toBeNull();
    });

    it('should not add provider header when provider is POWERED_BY', () => {
      const contextWithPortkey = {
        ...mockRequestContext,
        provider: POWERED_BY,
      } as RequestContext;

      const serviceWithPortkey = new ResponseService(
        contextWithPortkey,
        mockProviderContext,
        mockHooksService,
        mockLogsService
      );

      serviceWithPortkey.updateHeaders(mockResponse, 'MISS', 0);

      expect(mockResponse.headers.get(HEADER_KEYS.PROVIDER)).toBeNull();
    });

    it('should not add provider header when provider is empty', () => {
      const contextWithEmptyProvider = {
        ...mockRequestContext,
        provider: '',
      } as RequestContext;

      const serviceWithEmptyProvider = new ResponseService(
        contextWithEmptyProvider,
        mockProviderContext,
        mockHooksService,
        mockLogsService
      );

      serviceWithEmptyProvider.updateHeaders(mockResponse, 'MISS', 0);

      expect(mockResponse.headers.get(HEADER_KEYS.PROVIDER)).toBeNull();
    });

    it('should return the response object', () => {
      const result = responseService.updateHeaders(mockResponse, 'MISS', 0);

      expect(result).toBe(mockResponse);
    });
  });
});
