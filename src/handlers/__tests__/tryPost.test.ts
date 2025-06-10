import { Context } from 'hono';
import { tryPost } from '../handlerUtils';
import { Options } from '../../types/requestBody';
import { endpointStrings } from '../../providers/types';
import { HEADER_KEYS } from '../../globals';
import { GatewayError } from '../../errors/GatewayError';
import { HookType } from '../../middlewares/hooks/types';

// Mock all the service modules
jest.mock('../services/requestContext');
jest.mock('../services/hooksService');
jest.mock('../services/providerContext');
jest.mock('../services/logsService');
jest.mock('../services/responseService');
jest.mock('../services/cacheService');
jest.mock('../services/preRequestValidatorService');
jest.mock('../handlerUtils', () => ({
  ...jest.requireActual('../handlerUtils'),
  beforeRequestHookHandler: jest.fn(),
  recursiveAfterRequestHookHandler: jest.fn(),
}));

import { RequestContext } from '../services/requestContext';
import { HooksService } from '../services/hooksService';
import { ProviderContext } from '../services/providerContext';
import { LogsService, LogObjectBuilder } from '../services/logsService';
import { ResponseService } from '../services/responseService';
import { CacheService } from '../services/cacheService';
import { PreRequestValidatorService } from '../services/preRequestValidatorService';
// beforeRequestHookHandler and recursiveAfterRequestHookHandler are mocked above

// Type the mocked modules
const MockedRequestContext = RequestContext as jest.MockedClass<
  typeof RequestContext
>;
const MockedHooksService = HooksService as jest.MockedClass<
  typeof HooksService
>;
const MockedProviderContext = ProviderContext as jest.MockedClass<
  typeof ProviderContext
>;
const MockedLogsService = LogsService as jest.MockedClass<typeof LogsService>;
const MockedLogObjectBuilder = LogObjectBuilder as jest.MockedClass<
  typeof LogObjectBuilder
>;
const MockedResponseService = ResponseService as jest.MockedClass<
  typeof ResponseService
>;
const MockedCacheService = CacheService as jest.MockedClass<
  typeof CacheService
>;
const MockedPreRequestValidatorService =
  PreRequestValidatorService as jest.MockedClass<
    typeof PreRequestValidatorService
  >;

const { beforeRequestHookHandler, recursiveAfterRequestHookHandler } =
  jest.requireMock('../handlerUtils');
const mockedBeforeRequestHookHandler =
  beforeRequestHookHandler as jest.MockedFunction<any>;
const mockedRecursiveAfterRequestHookHandler =
  recursiveAfterRequestHookHandler as jest.MockedFunction<any>;

describe('tryPost Integration Tests', () => {
  let mockContext: Context;
  let mockProviderOption: Options;
  let mockRequestHeaders: Record<string, string>;
  let mockRequestBody: any;

  // Mock instances
  let mockRequestContextInstance: jest.Mocked<RequestContext>;
  let mockHooksServiceInstance: jest.Mocked<HooksService>;
  let mockProviderContextInstance: jest.Mocked<ProviderContext>;
  let mockLogsServiceInstance: jest.Mocked<LogsService>;
  let mockLogObjectBuilderInstance: jest.Mocked<LogObjectBuilder>;
  let mockResponseServiceInstance: jest.Mocked<ResponseService>;
  let mockCacheServiceInstance: jest.Mocked<CacheService>;
  let mockPreRequestValidatorServiceInstance: jest.Mocked<PreRequestValidatorService>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock context
    mockContext = {
      get: jest.fn(),
      set: jest.fn(),
      req: { url: 'https://gateway.com/v1/chat/completions' },
    } as unknown as Context;

    // Setup mock provider option
    mockProviderOption = {
      provider: 'openai',
      apiKey: 'sk-test123',
      retry: { attempts: 2, onStatusCodes: [500, 502] },
      cache: { mode: 'simple', maxAge: 3600 },
    };

    // Setup mock request data
    mockRequestHeaders = {
      [HEADER_KEYS.CONTENT_TYPE]: 'application/json',
      authorization: 'Bearer sk-test123',
    };

    mockRequestBody = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
    };

    // Setup mock instances
    setupMockInstances();
    setupMockConstructors();
  });

  function setupMockInstances() {
    mockRequestContextInstance = {
      provider: 'openai',
      requestURL: '',
      transformToProviderRequestAndSave: jest.fn(),
      beforeRequestHooks: [],
      afterRequestHooks: [],
      hasRetries: jest.fn().mockReturnValue(true),
      retryConfig: { attempts: 2, onStatusCodes: [500, 502] },
      cacheConfig: { mode: 'simple', maxAge: 3600 },
    } as unknown as jest.Mocked<RequestContext>;

    mockHooksServiceInstance = {
      hookSpan: { id: 'hook-span-123' },
      results: {
        beforeRequestHooksResult: [],
        afterRequestHooksResult: [],
      },
    } as unknown as jest.Mocked<HooksService>;

    mockProviderContextInstance = {
      getFullURL: jest
        .fn()
        .mockResolvedValue('https://api.openai.com/v1/chat/completions'),
      hasRequestHandler: jest.fn().mockReturnValue(false),
      getHeaders: jest
        .fn()
        .mockResolvedValue({ authorization: 'Bearer sk-test123' }),
    } as unknown as jest.Mocked<ProviderContext>;

    mockLogsServiceInstance = {
      addRequestLog: jest.fn(),
    } as unknown as jest.Mocked<LogsService>;

    mockLogObjectBuilderInstance = {
      addHookSpanId: jest.fn().mockReturnThis(),
      updateRequestContext: jest.fn().mockReturnThis(),
      addResponse: jest.fn().mockReturnThis(),
      addExecutionTime: jest.fn().mockReturnThis(),
      addCache: jest.fn().mockReturnThis(),
      log: jest.fn().mockReturnThis(),
      commit: jest.fn(),
      isDestroyed: jest.fn().mockReturnValue(false),
    } as unknown as jest.Mocked<LogObjectBuilder>;

    mockResponseServiceInstance = {
      create: jest.fn().mockResolvedValue({
        response: new Response('{"choices": []}', { status: 200 }),
        responseJson: { choices: [] },
        originalResponseJson: null,
      }),
    } as unknown as jest.Mocked<ResponseService>;

    mockCacheServiceInstance = {
      getCachedResponse: jest.fn().mockResolvedValue({
        cacheResponse: undefined,
        cacheStatus: 'MISS',
        cacheKey: undefined,
        createdAt: new Date(),
      }),
    } as unknown as jest.Mocked<CacheService>;

    mockPreRequestValidatorServiceInstance = {
      getResponse: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PreRequestValidatorService>;
  }

  function setupMockConstructors() {
    MockedRequestContext.mockImplementation(() => mockRequestContextInstance);
    MockedHooksService.mockImplementation(() => mockHooksServiceInstance);
    MockedProviderContext.mockImplementation(() => mockProviderContextInstance);
    MockedLogsService.mockImplementation(() => mockLogsServiceInstance);
    MockedLogObjectBuilder.mockImplementation(
      () => mockLogObjectBuilderInstance
    );
    MockedResponseService.mockImplementation(() => mockResponseServiceInstance);
    MockedCacheService.mockImplementation(() => mockCacheServiceInstance);
    MockedPreRequestValidatorService.mockImplementation(
      () => mockPreRequestValidatorServiceInstance
    );
  }

  describe('Successful Flow', () => {
    it('should execute complete successful workflow', async () => {
      // Setup successful mocks
      mockedBeforeRequestHookHandler.mockResolvedValue({
        response: null,
        createdAt: new Date(),
        transformedBody: mockRequestBody,
      });

      mockedRecursiveAfterRequestHookHandler.mockResolvedValue({
        mappedResponse: new Response('{"choices": []}', { status: 200 }),
        retryCount: 0,
        createdAt: new Date(),
        originalResponseJson: { choices: [] },
      });

      const result = await tryPost(
        mockContext,
        mockProviderOption,
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete' as endpointStrings,
        0,
        'POST'
      );

      // Verify service instantiation
      expect(MockedRequestContext).toHaveBeenCalledWith(
        mockContext,
        mockProviderOption,
        'chatComplete',
        mockRequestHeaders,
        mockRequestBody,
        'POST',
        0
      );

      expect(MockedHooksService).toHaveBeenCalledWith(
        mockRequestContextInstance
      );
      expect(MockedProviderContext).toHaveBeenCalledWith('openai');

      // Verify workflow steps
      expect(mockProviderContextInstance.getFullURL).toHaveBeenCalledWith(
        mockRequestContextInstance
      );
      expect(MockedLogObjectBuilder).toHaveBeenCalledWith(
        mockLogsServiceInstance,
        mockRequestContextInstance
      );
      expect(mockLogObjectBuilderInstance.addHookSpanId).toHaveBeenCalledWith(
        'hook-span-123'
      );

      // Verify hooks called
      expect(mockedBeforeRequestHookHandler).toHaveBeenCalledWith(
        mockContext,
        'hook-span-123'
      );

      // Verify cache service was used
      expect(MockedCacheService).toHaveBeenCalled();

      // Verify result
      expect(result).toBeInstanceOf(Response);
      expect(result.status).toBe(200);
    });

    it('should handle cache miss and make API call', async () => {
      // Setup cache miss
      mockCacheServiceInstance.getCachedResponse.mockResolvedValue({
        cacheResponse: undefined,
        cacheStatus: 'MISS',
        cacheKey: 'cache-key-123',
        createdAt: new Date(),
      });

      mockedBeforeRequestHookHandler.mockResolvedValue({
        response: null,
        createdAt: new Date(),
        transformedBody: mockRequestBody,
      });

      mockedRecursiveAfterRequestHookHandler.mockResolvedValue({
        mappedResponse: new Response('{"choices": []}', { status: 200 }),
        retryCount: 0,
        createdAt: new Date(),
        originalResponseJson: { choices: [] },
      });

      const result = await tryPost(
        mockContext,
        mockProviderOption,
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete' as endpointStrings,
        0
      );

      // Verify cache was checked
      expect(MockedCacheService).toHaveBeenCalled();
      expect(mockCacheServiceInstance.getCachedResponse).toHaveBeenCalled();

      // Verify API call was made (recursive handler called)
      expect(mockedRecursiveAfterRequestHookHandler).toHaveBeenCalled();

      expect(result.status).toBe(200);
    });

    it('should handle cache hit and return cached response', async () => {
      const cachedResponse = new Response(
        '{"choices": [{"message": {"content": "cached"}}]}',
        { status: 200 }
      );

      mockCacheServiceInstance.getCachedResponse.mockResolvedValue({
        cacheResponse: cachedResponse,
        cacheStatus: 'HIT',
        cacheKey: 'cache-key-123',
        createdAt: new Date(),
      });

      mockedBeforeRequestHookHandler.mockResolvedValue({
        response: null,
        createdAt: new Date(),
        transformedBody: mockRequestBody,
      });

      const result = await tryPost(
        mockContext,
        mockProviderOption,
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete' as endpointStrings,
        0
      );

      // Verify cache was checked
      expect(mockCacheServiceInstance.getCachedResponse).toHaveBeenCalled();

      // Verify recursive handler was NOT called (cache hit)
      expect(mockedRecursiveAfterRequestHookHandler).not.toHaveBeenCalled();

      // Verify logging was updated
      expect(mockLogObjectBuilderInstance.addCache).toHaveBeenCalledWith(
        'HIT',
        'cache-key-123'
      );

      expect(result).toBe(cachedResponse);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle before request hook failure', async () => {
      const hookFailureResponse = new Response('{"error": "Hook failed"}', {
        status: 446,
      });

      mockedBeforeRequestHookHandler.mockResolvedValue({
        response: hookFailureResponse,
        createdAt: new Date(),
        transformedBody: null,
      });

      const result = await tryPost(
        mockContext,
        mockProviderOption,
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete' as endpointStrings,
        0
      );

      // Verify hook failure response returned
      expect(result).toBe(hookFailureResponse);
      expect(result.status).toBe(446);

      // Verify recursive handler was not called
      expect(mockedRecursiveAfterRequestHookHandler).not.toHaveBeenCalled();

      // Verify transform was called for hook failure case
      expect(
        mockRequestContextInstance.transformToProviderRequestAndSave
      ).toHaveBeenCalled();
    });

    it('should handle pre-request validator failure', async () => {
      const validatorResponse = new Response('{"error": "Validation failed"}', {
        status: 400,
      });

      mockPreRequestValidatorServiceInstance.getResponse.mockResolvedValue(
        validatorResponse
      );

      mockedBeforeRequestHookHandler.mockResolvedValue({
        response: null,
        createdAt: new Date(),
        transformedBody: mockRequestBody,
      });

      const result = await tryPost(
        mockContext,
        mockProviderOption,
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete' as endpointStrings,
        0
      );

      // Verify validator response returned
      expect(result).toBe(validatorResponse);
      expect(result.status).toBe(400);

      // Verify recursive handler was not called
      expect(mockedRecursiveAfterRequestHookHandler).not.toHaveBeenCalled();
    });

    it('should handle provider context error', async () => {
      mockProviderContextInstance.getFullURL.mockRejectedValue(
        new Error('Provider not found')
      );

      mockedBeforeRequestHookHandler.mockResolvedValue({
        response: null,
        createdAt: new Date(),
        transformedBody: mockRequestBody,
      });

      await expect(
        tryPost(
          mockContext,
          mockProviderOption,
          mockRequestBody,
          mockRequestHeaders,
          'chatComplete' as endpointStrings,
          0
        )
      ).rejects.toThrow('Provider not found');
    });

    it('should handle cache service error gracefully', async () => {
      mockCacheServiceInstance.getCachedResponse.mockRejectedValue(
        new Error('Cache service down')
      );

      mockedBeforeRequestHookHandler.mockResolvedValue({
        response: null,
        createdAt: new Date(),
        transformedBody: mockRequestBody,
      });

      mockedRecursiveAfterRequestHookHandler.mockResolvedValue({
        mappedResponse: new Response('{"choices": []}', { status: 200 }),
        retryCount: 0,
        createdAt: new Date(),
        originalResponseJson: { choices: [] },
      });

      // Should continue with API call despite cache error
      const result = await tryPost(
        mockContext,
        mockProviderOption,
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete' as endpointStrings,
        0
      );

      expect(result.status).toBe(200);
      expect(mockedRecursiveAfterRequestHookHandler).toHaveBeenCalled();
    });
  });

  describe('Provider-specific Handling', () => {
    it('should handle provider with request handler', async () => {
      mockProviderContextInstance.hasRequestHandler.mockReturnValue(true);

      mockedBeforeRequestHookHandler.mockResolvedValue({
        response: null,
        createdAt: new Date(),
        transformedBody: mockRequestBody,
      });

      mockedRecursiveAfterRequestHookHandler.mockResolvedValue({
        mappedResponse: new Response('{"choices": []}', { status: 200 }),
        retryCount: 0,
        createdAt: new Date(),
        originalResponseJson: { choices: [] },
      });

      await tryPost(
        mockContext,
        mockProviderOption,
        mockRequestBody,
        mockRequestHeaders,
        'uploadFile' as endpointStrings,
        0
      );

      // Should not call transform when provider has request handler
      expect(
        mockRequestContextInstance.transformToProviderRequestAndSave
      ).not.toHaveBeenCalled();
    });

    it('should handle different HTTP methods', async () => {
      mockedBeforeRequestHookHandler.mockResolvedValue({
        response: null,
        createdAt: new Date(),
        transformedBody: mockRequestBody,
      });

      mockedRecursiveAfterRequestHookHandler.mockResolvedValue({
        mappedResponse: new Response('{"files": []}', { status: 200 }),
        retryCount: 0,
        createdAt: new Date(),
        originalResponseJson: { files: [] },
      });

      const result = await tryPost(
        mockContext,
        mockProviderOption,
        mockRequestBody,
        mockRequestHeaders,
        'listFiles' as endpointStrings,
        0,
        'GET'
      );

      // Verify RequestContext created with GET method
      expect(MockedRequestContext).toHaveBeenCalledWith(
        mockContext,
        mockProviderOption,
        'listFiles',
        mockRequestHeaders,
        mockRequestBody,
        'GET',
        0
      );

      expect(result.status).toBe(200);
    });
  });

  describe('Logging Integration', () => {
    it('should properly set up and use log object builder', async () => {
      mockedBeforeRequestHookHandler.mockResolvedValue({
        response: null,
        createdAt: new Date(),
        transformedBody: mockRequestBody,
      });

      mockedRecursiveAfterRequestHookHandler.mockResolvedValue({
        mappedResponse: new Response('{"choices": []}', { status: 200 }),
        retryCount: 0,
        createdAt: new Date(),
        originalResponseJson: { choices: [] },
      });

      await tryPost(
        mockContext,
        mockProviderOption,
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete' as endpointStrings,
        0
      );

      // Verify log object builder setup
      expect(MockedLogObjectBuilder).toHaveBeenCalledWith(
        mockLogsServiceInstance,
        mockRequestContextInstance
      );
      expect(mockLogObjectBuilderInstance.addHookSpanId).toHaveBeenCalledWith(
        'hook-span-123'
      );

      // Verify log object builder methods called
      expect(
        mockLogObjectBuilderInstance.updateRequestContext
      ).toHaveBeenCalled();
      expect(mockLogObjectBuilderInstance.addCache).toHaveBeenCalled();
    });

    it('should commit log object when destroyed', async () => {
      mockLogObjectBuilderInstance.isDestroyed.mockReturnValue(true);

      mockedBeforeRequestHookHandler.mockResolvedValue({
        response: null,
        createdAt: new Date(),
        transformedBody: mockRequestBody,
      });

      mockedRecursiveAfterRequestHookHandler.mockResolvedValue({
        mappedResponse: new Response('{"choices": []}', { status: 200 }),
        retryCount: 0,
        createdAt: new Date(),
        originalResponseJson: { choices: [] },
      });

      await tryPost(
        mockContext,
        mockProviderOption,
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete' as endpointStrings,
        0
      );

      // Should not call log methods on destroyed object
      expect(mockLogObjectBuilderInstance.log).not.toHaveBeenCalled();
    });
  });

  describe('Hook Processing', () => {
    it('should handle hooks with results', async () => {
      Object.defineProperty(mockHooksServiceInstance, 'results', {
        value: {
          beforeRequestHooksResult: [
            { id: 'hook1', verdict: true, type: HookType.GUARDRAIL } as any,
          ],
          afterRequestHooksResult: [],
        },
        writable: true,
      });

      mockedBeforeRequestHookHandler.mockResolvedValue({
        response: null,
        createdAt: new Date(),
        transformedBody: mockRequestBody,
      });

      mockedRecursiveAfterRequestHookHandler.mockResolvedValue({
        mappedResponse: new Response('{"choices": []}', { status: 200 }),
        retryCount: 0,
        createdAt: new Date(),
        originalResponseJson: { choices: [] },
      });

      await tryPost(
        mockContext,
        mockProviderOption,
        mockRequestBody,
        mockRequestHeaders,
        'chatComplete' as endpointStrings,
        0
      );

      // Verify hooks service was created with hook results
      expect(MockedHooksService).toHaveBeenCalledWith(
        mockRequestContextInstance
      );
    });
  });
});
