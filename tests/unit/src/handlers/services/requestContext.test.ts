import { Context } from 'hono';
import { RequestContext } from '../../../../../src/handlers/services/requestContext';
import { Options, Params } from '../../../../../src/types/requestBody';
import { endpointStrings } from '../../../../../src/providers/types';
import { HEADER_KEYS } from '../../../../../src/globals';
import { HooksManager } from '../../../../../src/middlewares/hooks';
import { HookType } from '../../../../../src/middlewares/hooks/types';

// Mock the transformToProviderRequest function
jest.mock('../../../services/transformToProviderRequest', () => ({
  transformToProviderRequest: jest.fn().mockReturnValue({ transformed: true }),
}));

describe('RequestContext', () => {
  let mockContext: Context;
  let mockProviderOption: Options;
  let mockRequestHeaders: Record<string, string>;
  let mockRequestBody: Params;
  let requestContext: RequestContext;

  beforeEach(() => {
    mockContext = {
      get: jest.fn(),
      set: jest.fn(),
    } as unknown as Context;

    mockProviderOption = {
      provider: 'openai',
      apiKey: 'sk-test123',
      retry: { attempts: 3, onStatusCodes: [500, 502] },
      cache: { mode: 'simple', maxAge: 3600 },
      overrideParams: { temperature: 0.7 },
      forwardHeaders: ['x-custom-header'],
      customHost: 'https://custom.openai.com',
      requestTimeout: 30000,
      strictOpenAiCompliance: true,
      beforeRequestHooks: [],
      afterRequestHooks: [],
      defaultInputGuardrails: [],
      defaultOutputGuardrails: [],
    };

    mockRequestHeaders = {
      [HEADER_KEYS.CONTENT_TYPE]: 'application/json',
      [HEADER_KEYS.TRACE_ID]: 'trace-123',
      [HEADER_KEYS.METADATA]: '{"userId": "user123"}',
      [HEADER_KEYS.FORWARD_HEADERS]: 'x-custom-header,x-another-header',
      [HEADER_KEYS.CUSTOM_HOST]: 'https://custom.api.com',
      [HEADER_KEYS.REQUEST_TIMEOUT]: '45000',
      [HEADER_KEYS.STRICT_OPEN_AI_COMPLIANCE]: 'true',
      authorization: 'Bearer sk-test123',
      'x-custom-header': 'custom-value',
    };

    mockRequestBody = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
      stream: false,
    };

    requestContext = new RequestContext(
      mockContext,
      mockProviderOption,
      'chatComplete' as endpointStrings,
      mockRequestHeaders,
      mockRequestBody,
      'POST',
      0
    );
  });

  describe('constructor', () => {
    it('should initialize with provided values', () => {
      expect(requestContext.honoContext).toBe(mockContext);
      expect(requestContext.providerOption).toBe(mockProviderOption);
      expect(requestContext.endpoint).toBe('chatComplete');
      expect(requestContext.requestHeaders).toBe(mockRequestHeaders);
      expect(requestContext.requestBody).toBe(mockRequestBody);
      expect(requestContext.method).toBe('POST');
      expect(requestContext.index).toBe(0);
    });

    it('should normalize retry config on initialization', () => {
      expect(requestContext.providerOption.retry).toEqual({
        attempts: 3,
        onStatusCodes: [500, 502],
        useRetryAfterHeader: undefined,
      });
    });

    it('should set default retry config when not provided', () => {
      const contextWithoutRetry = new RequestContext(
        mockContext,
        { provider: 'openai' },
        'chatComplete' as endpointStrings,
        {},
        {},
        'POST',
        0
      );

      expect(contextWithoutRetry.providerOption.retry).toEqual({
        attempts: 0,
        onStatusCodes: [],
        useRetryAfterHeader: undefined,
      });
    });
  });

  describe('requestURL getter/setter', () => {
    it('should get and set request URL', () => {
      expect(requestContext.requestURL).toBe('');

      requestContext.requestURL = 'https://api.openai.com/v1/chat/completions';
      expect(requestContext.requestURL).toBe(
        'https://api.openai.com/v1/chat/completions'
      );
    });
  });

  describe('overrideParams getter', () => {
    it('should return override params from provider option', () => {
      expect(requestContext.overrideParams).toEqual({ temperature: 0.7 });
    });

    it('should return empty object when no override params', () => {
      const context = new RequestContext(
        mockContext,
        { provider: 'openai' },
        'chatComplete' as endpointStrings,
        {},
        {},
        'POST',
        0
      );

      expect(context.overrideParams).toEqual({});
    });
  });

  describe('params getter/setter', () => {
    it('should return merged request body and override params', () => {
      expect(requestContext.params).toEqual({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false,
        temperature: 0.7,
      });
    });

    it('should override request body params with override params', () => {
      const bodyWithTemperature = {
        model: 'gpt-4',
        temperature: 0.5,
        messages: [],
      };
      const context = new RequestContext(
        mockContext,
        mockProviderOption,
        'chatComplete' as endpointStrings,
        {},
        bodyWithTemperature,
        'POST',
        0
      );

      expect(context.params.temperature).toBe(0.7); // Override wins
    });

    it('should return empty object for non-JSON request bodies', () => {
      const formData = new FormData();
      const context = new RequestContext(
        mockContext,
        mockProviderOption,
        'uploadFile' as endpointStrings,
        {},
        formData,
        'POST',
        0
      );

      expect(context.params).toEqual({});
    });

    it('should allow setting params directly', () => {
      requestContext.params = { model: 'gpt-3.5-turbo', messages: [] };
      expect(requestContext.params).toEqual({
        model: 'gpt-3.5-turbo',
        messages: [],
      });
    });

    it('should handle ReadableStream request body', () => {
      const stream = new ReadableStream();
      const context = new RequestContext(
        mockContext,
        mockProviderOption,
        'chatComplete' as endpointStrings,
        {},
        stream,
        'POST',
        0
      );

      expect(context.params).toEqual({});
    });

    it('should handle null request body', () => {
      const context = new RequestContext(
        mockContext,
        mockProviderOption,
        'chatComplete' as endpointStrings,
        {},
        null as any,
        'POST',
        0
      );

      expect(context.params).toEqual({});
    });
  });

  describe('transformedRequestBody getter/setter', () => {
    it('should get and set transformed request body', () => {
      expect(requestContext.transformedRequestBody).toBeUndefined();

      const transformed = { model: 'claude-3', messages: [] };
      requestContext.transformedRequestBody = transformed;
      expect(requestContext.transformedRequestBody).toBe(transformed);
    });
  });

  describe('getHeader', () => {
    it('should return content type without parameters', () => {
      const headers = {
        [HEADER_KEYS.CONTENT_TYPE.toLowerCase()]:
          'application/json; charset=utf-8',
      };
      const context = new RequestContext(
        mockContext,
        mockProviderOption,
        'chatComplete' as endpointStrings,
        headers,
        {},
        'POST',
        0
      );

      expect(context.getHeader(HEADER_KEYS.CONTENT_TYPE)).toBe(
        'application/json'
      );
    });

    it('should return header value for non-content-type headers', () => {
      expect(requestContext.getHeader('authorization')).toBe(
        'Bearer sk-test123'
      );
    });

    it('should return empty string for missing headers', () => {
      expect(requestContext.getHeader('non-existent-header')).toBe('');
    });
  });

  describe('traceId getter', () => {
    it('should return trace ID from headers', () => {
      expect(requestContext.traceId).toBe('trace-123');
    });

    it('should return empty string when no trace ID', () => {
      const context = new RequestContext(
        mockContext,
        mockProviderOption,
        'chatComplete' as endpointStrings,
        {},
        {},
        'POST',
        0
      );

      expect(context.traceId).toBe('');
    });
  });

  describe('isStreaming getter', () => {
    it('should return true when stream is true', () => {
      const streamingBody = { ...mockRequestBody, stream: true };
      const context = new RequestContext(
        mockContext,
        mockProviderOption,
        'chatComplete' as endpointStrings,
        {},
        streamingBody,
        'POST',
        0
      );

      expect(context.isStreaming).toBe(true);
    });

    it('should return false when stream is false', () => {
      expect(requestContext.isStreaming).toBe(false);
    });

    it('should return false when stream is not set', () => {
      const { stream, ...bodyWithoutStream } = mockRequestBody;
      const context = new RequestContext(
        mockContext,
        mockProviderOption,
        'chatComplete' as endpointStrings,
        {},
        bodyWithoutStream,
        'POST',
        0
      );

      expect(context.isStreaming).toBe(false);
    });
  });

  describe('strictOpenAiCompliance getter', () => {
    it('should return false when header is "false"', () => {
      const headers = {
        [HEADER_KEYS.STRICT_OPEN_AI_COMPLIANCE]: 'false',
      };
      const context = new RequestContext(
        mockContext,
        mockProviderOption,
        'chatComplete' as endpointStrings,
        headers,
        {},
        'POST',
        0
      );

      expect(context.strictOpenAiCompliance).toBe(false);
    });

    it('should return false when provider option is false', () => {
      const option = { ...mockProviderOption, strictOpenAiCompliance: false };
      const context = new RequestContext(
        mockContext,
        option,
        'chatComplete' as endpointStrings,
        {},
        {},
        'POST',
        0
      );

      expect(context.strictOpenAiCompliance).toBe(false);
    });

    it('should return true by default', () => {
      const context = new RequestContext(
        mockContext,
        { provider: 'openai' },
        'chatComplete' as endpointStrings,
        {},
        {},
        'POST',
        0
      );

      expect(context.strictOpenAiCompliance).toBe(true);
    });
  });

  describe('metadata getter', () => {
    it('should parse JSON metadata from headers', () => {
      expect(requestContext.metadata).toEqual({ userId: 'user123' });
    });

    it('should return empty object for invalid JSON', () => {
      const headers = {
        [HEADER_KEYS.METADATA]: '{invalid json}',
      };
      const context = new RequestContext(
        mockContext,
        mockProviderOption,
        'chatComplete' as endpointStrings,
        headers,
        {},
        'POST',
        0
      );

      expect(context.metadata).toEqual({});
    });

    it('should return empty object when no metadata header', () => {
      const context = new RequestContext(
        mockContext,
        mockProviderOption,
        'chatComplete' as endpointStrings,
        {},
        {},
        'POST',
        0
      );

      expect(context.metadata).toEqual({});
    });
  });

  describe('forwardHeaders getter', () => {
    it('should parse forward headers from header', () => {
      expect(requestContext.forwardHeaders).toEqual([
        'x-custom-header',
        'x-another-header',
      ]);
    });

    it('should return forward headers from provider option when header not present', () => {
      const context = new RequestContext(
        mockContext,
        mockProviderOption,
        'chatComplete' as endpointStrings,
        {},
        {},
        'POST',
        0
      );

      expect(context.forwardHeaders).toEqual(['x-custom-header']);
    });

    it('should return empty array when neither header nor option present', () => {
      const option = { ...mockProviderOption };
      delete option.forwardHeaders;
      const context = new RequestContext(
        mockContext,
        option,
        'chatComplete' as endpointStrings,
        {},
        {},
        'POST',
        0
      );

      expect(context.forwardHeaders).toEqual([]);
    });
  });

  describe('customHost getter', () => {
    it('should return custom host from header', () => {
      expect(requestContext.customHost).toBe('https://custom.api.com');
    });

    it('should return custom host from provider option when header not present', () => {
      const context = new RequestContext(
        mockContext,
        mockProviderOption,
        'chatComplete' as endpointStrings,
        {},
        {},
        'POST',
        0
      );

      expect(context.customHost).toBe('https://custom.openai.com');
    });

    it('should return empty string when neither present', () => {
      const option = { ...mockProviderOption };
      delete option.customHost;
      const context = new RequestContext(
        mockContext,
        option,
        'chatComplete' as endpointStrings,
        {},
        {},
        'POST',
        0
      );

      expect(context.customHost).toBe('');
    });
  });

  describe('requestTimeout getter', () => {
    it('should return timeout from header as number', () => {
      expect(requestContext.requestTimeout).toBe(45000);
    });

    it('should return timeout from provider option when header not present', () => {
      const context = new RequestContext(
        mockContext,
        mockProviderOption,
        'chatComplete' as endpointStrings,
        {},
        {},
        'POST',
        0
      );

      expect(context.requestTimeout).toBe(30000);
    });

    it('should return null when neither present', () => {
      const option = { ...mockProviderOption };
      delete option.requestTimeout;
      const context = new RequestContext(
        mockContext,
        option,
        'chatComplete' as endpointStrings,
        {},
        {},
        'POST',
        0
      );

      expect(context.requestTimeout).toBeNull();
    });
  });

  describe('provider getter', () => {
    it('should return provider from provider option', () => {
      expect(requestContext.provider).toBe('openai');
    });

    it('should return empty string when no provider', () => {
      const context = new RequestContext(
        mockContext,
        { provider: 'openai' },
        'chatComplete' as endpointStrings,
        {},
        {},
        'POST',
        0
      );

      expect(context.provider).toBe('');
    });
  });

  describe('retryConfig getter', () => {
    it('should return normalized retry config', () => {
      expect(requestContext.retryConfig).toEqual({
        attempts: 3,
        onStatusCodes: [500, 502],
        useRetryAfterHeader: undefined,
      });
    });
  });

  describe('cacheConfig getter', () => {
    it('should return cache config from object', () => {
      expect(requestContext.cacheConfig).toEqual({
        mode: 'simple',
        maxAge: 3600,
        cacheStatus: 'MISS',
      });
    });

    it('should return cache config from string', () => {
      const option = { ...mockProviderOption, cache: 'semantic' };
      const context = new RequestContext(
        mockContext,
        option,
        'chatComplete' as endpointStrings,
        {},
        {},
        'POST',
        0
      );

      expect(context.cacheConfig).toEqual({
        mode: 'semantic',
        maxAge: undefined,
        cacheStatus: 'MISS',
      });
    });

    it('should return disabled cache when no config', () => {
      const option = { ...mockProviderOption };
      delete option.cache;
      const context = new RequestContext(
        mockContext,
        option,
        'chatComplete' as endpointStrings,
        {},
        {},
        'POST',
        0
      );

      expect(context.cacheConfig).toEqual({
        mode: 'DISABLED',
        maxAge: undefined,
        cacheStatus: 'DISABLED',
      });
    });

    it('should parse string maxAge to number', () => {
      const option = {
        ...mockProviderOption,
        cache: { mode: 'simple', maxAge: 7200 },
      };
      const context = new RequestContext(
        mockContext,
        option,
        'chatComplete' as endpointStrings,
        {},
        {},
        'POST',
        0
      );

      expect(context.cacheConfig.maxAge).toBe(7200);
    });
  });

  describe('hasRetries', () => {
    it('should return true when retry attempts > 0', () => {
      expect(requestContext.hasRetries()).toBe(true);
    });

    it('should return false when retry attempts = 0', () => {
      const option = {
        ...mockProviderOption,
        retry: { attempts: 0, onStatusCodes: [] },
      };
      const context = new RequestContext(
        mockContext,
        option,
        'chatComplete' as endpointStrings,
        {},
        {},
        'POST',
        0
      );

      expect(context.hasRetries()).toBe(false);
    });
  });

  describe('hooks getters', () => {
    it('should return combined before request hooks', () => {
      const beforeHooks = [
        {
          id: 'hook1',
          type: HookType.GUARDRAIL,
          eventType: 'beforeRequestHook' as const,
        },
      ];
      const defaultInputGuardrails = [
        {
          id: 'guard1',
          type: HookType.GUARDRAIL,
          eventType: 'beforeRequestHook' as const,
        },
      ];
      const option = {
        ...mockProviderOption,
        beforeRequestHooks: beforeHooks,
        defaultInputGuardrails: defaultInputGuardrails,
      };
      const context = new RequestContext(
        mockContext,
        option,
        'chatComplete' as endpointStrings,
        {},
        {},
        'POST',
        0
      );

      expect(context.beforeRequestHooks).toEqual([
        ...beforeHooks,
        ...defaultInputGuardrails,
      ]);
    });

    it('should return combined after request hooks', () => {
      const afterHooks = [
        {
          id: 'hook2',
          type: HookType.GUARDRAIL,
          eventType: 'afterRequestHook' as const,
        },
      ];
      const defaultOutputGuardrails = [
        {
          id: 'guard2',
          type: HookType.GUARDRAIL,
          eventType: 'afterRequestHook' as const,
        },
      ];
      const option = {
        ...mockProviderOption,
        afterRequestHooks: afterHooks,
        defaultOutputGuardrails: defaultOutputGuardrails,
      };
      const context = new RequestContext(
        mockContext,
        option,
        'chatComplete' as endpointStrings,
        {},
        {},
        'POST',
        0
      );

      expect(context.afterRequestHooks).toEqual([
        ...afterHooks,
        ...defaultOutputGuardrails,
      ]);
    });
  });

  describe('hooksManager getter', () => {
    it('should return hooks manager from context', () => {
      const mockHooksManager = {} as HooksManager;
      (mockContext.get as jest.Mock).mockReturnValue(mockHooksManager);

      expect(requestContext.hooksManager).toBe(mockHooksManager);
      expect(mockContext.get).toHaveBeenCalledWith('hooksManager');
    });
  });

  describe('transformToProviderRequestAndSave', () => {
    it('should transform request body for POST method', () => {
      const {
        transformToProviderRequest,
      } = require('../../../services/transformToProviderRequest');

      requestContext.transformToProviderRequestAndSave();

      expect(transformToProviderRequest).toHaveBeenCalledWith(
        'openai',
        requestContext.params,
        requestContext.requestBody,
        'chatComplete',
        requestContext.requestHeaders,
        requestContext.providerOption
      );
      expect(requestContext.transformedRequestBody).toEqual({
        transformed: true,
      });
    });

    it('should not transform for non-POST methods', () => {
      const {
        transformToProviderRequest,
      } = require('../../../services/transformToProviderRequest');
      const context = new RequestContext(
        mockContext,
        mockProviderOption,
        'listFiles' as endpointStrings,
        {},
        mockRequestBody,
        'GET',
        0
      );

      context.transformToProviderRequestAndSave();

      expect(transformToProviderRequest).not.toHaveBeenCalled();
      expect(context.transformedRequestBody).toBe(mockRequestBody);
    });
  });

  describe('requestOptions getter/setter', () => {
    it('should get request options from context', () => {
      const mockOptions = [{ option1: 'value1' }];
      (mockContext.get as jest.Mock).mockReturnValue(mockOptions);

      expect(requestContext.requestOptions).toBe(mockOptions);
      expect(mockContext.get).toHaveBeenCalledWith('requestOptions');
    });

    it('should return empty array when no options', () => {
      (mockContext.get as jest.Mock).mockReturnValue(undefined);

      expect(requestContext.requestOptions).toEqual([]);
    });
  });

  describe('appendRequestOptions', () => {
    it('should append request options to existing options', () => {
      const existingOptions = [{ option1: 'value1' }];
      const newOption = { option2: 'value2' };
      (mockContext.get as jest.Mock).mockReturnValue(existingOptions);

      requestContext.appendRequestOptions(newOption);

      expect(mockContext.set).toHaveBeenCalledWith('requestOptions', [
        { option1: 'value1' },
        { option2: 'value2' },
      ]);
    });

    it('should append to empty options array', () => {
      const newOption = { option1: 'value1' };
      (mockContext.get as jest.Mock).mockReturnValue([]);

      requestContext.appendRequestOptions(newOption);

      expect(mockContext.set).toHaveBeenCalledWith('requestOptions', [
        { option1: 'value1' },
      ]);
    });
  });
});
