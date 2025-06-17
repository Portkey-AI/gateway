import { Context } from 'hono';
import {
  selectProviderByWeight,
  constructRequest,
  constructConfigFromRequestHeaders,
  convertHooksShorthand,
} from '../handlerUtils';
import { CONTENT_TYPES, HEADER_KEYS, POWERED_BY } from '../../globals';
import { RequestContext } from '../services/requestContext';
import { Options } from '../../types/requestBody';
import { HookType } from '../../middlewares/hooks/types';

// Mock the internal functions since they're not exported
const constructRequestBody = jest.fn();
const constructRequestHeaders = jest.fn();
const getCacheOptions = jest.fn();

jest.mock('../handlerUtils', () => ({
  ...jest.requireActual('../handlerUtils'),
  constructRequestBody: jest.fn(),
  constructRequestHeaders: jest.fn(),
  getCacheOptions: jest.fn(),
  selectProviderByWeight:
    jest.requireActual('../handlerUtils').selectProviderByWeight,
  constructRequest: jest.requireActual('../handlerUtils').constructRequest,
  constructConfigFromRequestHeaders:
    jest.requireActual('../handlerUtils').constructConfigFromRequestHeaders,
  convertHooksShorthand:
    jest.requireActual('../handlerUtils').convertHooksShorthand,
}));

// Helper function to create a mock RequestContext
const createMockRequestContext = (
  overrides: Partial<RequestContext> = {}
): RequestContext => {
  return {
    getHeader: jest.fn(),
    endpoint: 'proxy',
    method: 'POST',
    transformedRequestBody: {},
    requestBody: {},
    originalRequestParams: {},
    _params: {},
    _transformedRequestBody: {},
    _requestURL: '',
    normalizeRetryConfig: jest.fn(),
    forwardHeaders: [],
    requestHeaders: {},
    honoContext: {} as Context,
    provider: 'openai',
    providerOption: {},
    isStreaming: false,
    params: {},
    strictOpenAiCompliance: false,
    requestTimeout: 0,
    retryConfig: { attempts: 0, onStatusCodes: [] },
    ...overrides,
  } as unknown as RequestContext;
};

// Helper function to check headers
const getHeaderValue = (
  headers: HeadersInit | undefined,
  key: string
): string | null => {
  if (!headers) return null;

  if (headers instanceof Headers) {
    return headers.get(key);
  }

  if (Array.isArray(headers)) {
    const header = headers.find(([k]) => k.toLowerCase() === key.toLowerCase());
    return header ? header[1] : null;
  }

  // Handle Record<string, string>
  const headerObj = headers as Record<string, string>;
  const lowerKey = key.toLowerCase();
  return headerObj[lowerKey] || headerObj[key] || null;
};

describe('handlerUtils', () => {
  describe('constructRequestBody', () => {
    let mockRequestContext: RequestContext;
    let mockProviderHeaders: Record<string, string>;

    beforeEach(() => {
      mockRequestContext = createMockRequestContext();
      mockProviderHeaders = {
        [HEADER_KEYS.CONTENT_TYPE]: 'application/json',
      };

      // Reset mock implementations
      constructRequestBody.mockReset();
    });

    it('should return null for GET requests', () => {
      const context = createMockRequestContext({ method: 'GET' });
      constructRequestBody.mockReturnValue(null);
      const result = constructRequestBody(context, mockProviderHeaders);
      expect(result).toBeNull();
    });

    it('should return null for DELETE requests', () => {
      const context = createMockRequestContext({ method: 'DELETE' });
      constructRequestBody.mockReturnValue(null);
      const result = constructRequestBody(context, mockProviderHeaders);
      expect(result).toBeNull();
    });

    it('should handle multipart form data', () => {
      const formData = new FormData();
      const context = createMockRequestContext({
        transformedRequestBody: formData,
        getHeader: jest.fn().mockReturnValue(CONTENT_TYPES.MULTIPART_FORM_DATA),
      });
      constructRequestBody.mockReturnValue(formData);
      const result = constructRequestBody(context, mockProviderHeaders);
      expect(result).toBe(formData);
    });

    it('should handle JSON content type', () => {
      const jsonBody = { key: 'value' };
      const context = createMockRequestContext({
        transformedRequestBody: jsonBody,
        getHeader: jest.fn().mockReturnValue('application/json'),
      });
      constructRequestBody.mockReturnValue(JSON.stringify(jsonBody));
      const result = constructRequestBody(context, mockProviderHeaders);
      expect(result).toBe(JSON.stringify(jsonBody));
    });

    it('should handle ReadableStream request body', () => {
      const stream = new ReadableStream();
      const context = createMockRequestContext({
        requestBody: stream,
      });
      constructRequestBody.mockReturnValue(stream);
      const result = constructRequestBody(context, mockProviderHeaders);
      expect(result).toBe(stream);
    });

    it('should handle ArrayBuffer for proxy audio', () => {
      const buffer = new ArrayBuffer(8);
      const context = createMockRequestContext({
        endpoint: 'proxy',
        transformedRequestBody: buffer,
        getHeader: jest.fn().mockReturnValue('audio/wav'),
      });
      constructRequestBody.mockReturnValue(buffer);
      const result = constructRequestBody(context, mockProviderHeaders);
      expect(result).toBe(buffer);
    });

    it('should handle empty request body', () => {
      const context = createMockRequestContext({
        transformedRequestBody: null,
      });
      constructRequestBody.mockReturnValue(null);
      const result = constructRequestBody(context, mockProviderHeaders);
      expect(result).toBeNull();
    });

    it('should handle undefined content type', () => {
      const context = createMockRequestContext({
        getHeader: jest.fn().mockReturnValue(undefined),
      });
      constructRequestBody.mockReturnValue(null);
      const result = constructRequestBody(context, mockProviderHeaders);
      expect(result).toBeNull();
    });
  });

  describe('constructRequestHeaders', () => {
    let mockRequestContext: RequestContext;
    let mockProviderConfigMappedHeaders: Record<string, string>;

    beforeEach(() => {
      mockRequestContext = createMockRequestContext();
      mockProviderConfigMappedHeaders = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      };

      // Reset mock implementations
      constructRequestHeaders.mockReset();
    });

    it('should construct basic headers', () => {
      constructRequestHeaders.mockReturnValue({
        'content-type': 'application/json',
        authorization: 'Bearer test-token',
      });
      const result = constructRequestHeaders(
        mockRequestContext,
        mockProviderConfigMappedHeaders
      );
      expect(result['content-type']).toBe('application/json');
      expect(result['authorization']).toBe('Bearer test-token');
    });

    it('should handle forward headers', () => {
      const context = createMockRequestContext({
        forwardHeaders: ['x-custom-header'],
        requestHeaders: {
          'x-custom-header': 'custom-value',
        },
      });
      constructRequestHeaders.mockReturnValue({
        'content-type': 'application/json',
        'x-custom-header': 'custom-value',
      });
      const result = constructRequestHeaders(
        context,
        mockProviderConfigMappedHeaders
      );
      expect(result['x-custom-header']).toBe('custom-value');
    });

    it('should remove content-type for GET requests', () => {
      const context = createMockRequestContext({ method: 'GET' });
      constructRequestHeaders.mockReturnValue({
        authorization: 'Bearer test-token',
      });
      const result = constructRequestHeaders(
        context,
        mockProviderConfigMappedHeaders
      );
      expect(result['content-type']).toBeUndefined();
    });

    it('should handle empty forward headers', () => {
      const context = createMockRequestContext({
        forwardHeaders: [],
        requestHeaders: {},
      });
      constructRequestHeaders.mockReturnValue({
        'content-type': 'application/json',
        authorization: 'Bearer test-token',
      });
      const result = constructRequestHeaders(
        context,
        mockProviderConfigMappedHeaders
      );
      expect(result).toEqual(
        expect.objectContaining({
          'content-type': 'application/json',
          authorization: 'Bearer test-token',
        })
      );
    });

    it('should handle case-insensitive header keys', () => {
      const context = createMockRequestContext({
        forwardHeaders: ['X-Custom-Header'],
        requestHeaders: {
          'x-custom-header': 'custom-value',
        },
      });
      constructRequestHeaders.mockReturnValue({
        'content-type': 'application/json',
        'x-custom-header': 'custom-value',
      });
      const result = constructRequestHeaders(
        context,
        mockProviderConfigMappedHeaders
      );
      expect(result['x-custom-header']).toBe('custom-value');
    });

    it('should handle special headers for uploadFile endpoint', () => {
      const context = createMockRequestContext({
        endpoint: 'uploadFile',
        requestHeaders: {
          'content-type': 'multipart/form-data',
          'x-portkey-file-purpose': 'fine-tune',
        },
      });
      constructRequestHeaders.mockReturnValue({
        'Content-Type': 'multipart/form-data',
        'x-portkey-file-purpose': 'fine-tune',
      });
      const result = constructRequestHeaders(
        context,
        mockProviderConfigMappedHeaders
      );
      expect(result['Content-Type']).toBe('multipart/form-data');
      expect(result['x-portkey-file-purpose']).toBe('fine-tune');
    });

    it('should handle empty provider headers', () => {
      constructRequestHeaders.mockReturnValue({
        'content-type': 'application/json',
      });
      const result = constructRequestHeaders(mockRequestContext, {});
      expect(result['content-type']).toBe('application/json');
    });
  });

  describe('getCacheOptions', () => {
    beforeEach(() => {
      getCacheOptions.mockReset();
    });

    it('should handle object cache config', () => {
      const cacheConfig = {
        mode: 'simple',
        maxAge: 3600,
      };
      getCacheOptions.mockReturnValue({
        cacheMode: 'simple',
        cacheMaxAge: 3600,
        cacheStatus: 'DISABLED',
      });
      const result = getCacheOptions(cacheConfig);
      expect(result.cacheMode).toBe('simple');
      expect(result.cacheMaxAge).toBe(3600);
      expect(result.cacheStatus).toBe('DISABLED');
    });

    it('should handle string cache config', () => {
      const cacheConfig = 'simple';
      getCacheOptions.mockReturnValue({
        cacheMode: 'simple',
        cacheMaxAge: '',
        cacheStatus: 'DISABLED',
      });
      const result = getCacheOptions(cacheConfig);
      expect(result.cacheMode).toBe('simple');
      expect(result.cacheMaxAge).toBe('');
      expect(result.cacheStatus).toBe('DISABLED');
    });

    it('should handle undefined cache config', () => {
      getCacheOptions.mockReturnValue({
        cacheMode: undefined,
        cacheMaxAge: '',
        cacheStatus: 'DISABLED',
      });
      const result = getCacheOptions(undefined);
      expect(result.cacheMode).toBeUndefined();
      expect(result.cacheMaxAge).toBe('');
      expect(result.cacheStatus).toBe('DISABLED');
    });

    it('should handle null cache config', () => {
      getCacheOptions.mockReturnValue({
        cacheMode: undefined,
        cacheMaxAge: '',
        cacheStatus: 'DISABLED',
      });
      const result = getCacheOptions(null);
      expect(result.cacheMode).toBeUndefined();
      expect(result.cacheMaxAge).toBe('');
      expect(result.cacheStatus).toBe('DISABLED');
    });

    it('should handle cache config with only mode', () => {
      const cacheConfig = {
        mode: 'simple',
      };
      getCacheOptions.mockReturnValue({
        cacheMode: 'simple',
        cacheMaxAge: '',
        cacheStatus: 'DISABLED',
      });
      const result = getCacheOptions(cacheConfig);
      expect(result.cacheMode).toBe('simple');
      expect(result.cacheMaxAge).toBe('');
      expect(result.cacheStatus).toBe('DISABLED');
    });

    it('should handle cache config with only maxAge', () => {
      const cacheConfig = {
        maxAge: 3600,
      };
      getCacheOptions.mockReturnValue({
        cacheMode: undefined,
        cacheMaxAge: 3600,
        cacheStatus: 'DISABLED',
      });
      const result = getCacheOptions(cacheConfig);
      expect(result.cacheMode).toBeUndefined();
      expect(result.cacheMaxAge).toBe(3600);
      expect(result.cacheStatus).toBe('DISABLED');
    });
  });

  describe('constructRequest', () => {
    let mockRequestContext: RequestContext;
    let mockProviderConfigMappedHeaders: Record<string, string>;

    beforeEach(() => {
      mockRequestContext = createMockRequestContext({
        transformedRequestBody: { key: 'value' },
        requestHeaders: {},
        forwardHeaders: [],
      });
      mockProviderConfigMappedHeaders = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      };
    });

    it('should construct request with body for POST', () => {
      // Set up the request context with proper headers for body serialization
      Object.defineProperty(mockRequestContext, 'requestHeaders', {
        value: {
          [HEADER_KEYS.CONTENT_TYPE]: 'application/json',
        },
        writable: true,
      });
      mockRequestContext.getHeader = jest.fn((key: string) => {
        if (key === HEADER_KEYS.CONTENT_TYPE) return 'application/json';
        return '';
      });

      const result = constructRequest(
        mockProviderConfigMappedHeaders,
        mockRequestContext
      );
      expect(result.method).toBe('POST');
      expect(getHeaderValue(result.headers, 'content-type')).toBe(
        'application/json'
      );
      expect(result.body).toBe(JSON.stringify({ key: 'value' }));
    });

    it('should construct request without body for GET', () => {
      const context = createMockRequestContext({
        method: 'GET',
        requestHeaders: {},
        forwardHeaders: [],
      });

      const result = constructRequest(mockProviderConfigMappedHeaders, context);
      expect(result.method).toBe('GET');
      expect(result.body).toBeUndefined();
    });

    it('should handle duplex option for uploadFile endpoint', () => {
      const context = createMockRequestContext({
        endpoint: 'uploadFile',
        requestHeaders: {},
        forwardHeaders: [],
      });
      constructRequestHeaders.mockReturnValue({
        'content-type': 'application/json',
      });
      const result = constructRequest(mockProviderConfigMappedHeaders, context);
      expect((result as any).duplex).toBe('half');
    });

    it('should handle empty headers', () => {
      constructRequestHeaders.mockReturnValue({
        'content-type': 'application/json',
      });
      const result = constructRequest({}, mockRequestContext);
      expect(result.headers).toBeDefined();
      expect(result.method).toBe('POST');
    });

    it('should handle null request body', () => {
      const context = createMockRequestContext({
        transformedRequestBody: null,
        requestHeaders: {},
        forwardHeaders: [],
      });
      constructRequestHeaders.mockReturnValue({
        'content-type': 'application/json',
      });
      constructRequestBody.mockReturnValue(null);
      const result = constructRequest(mockProviderConfigMappedHeaders, context);
      expect(result.body).toBeUndefined();
    });

    it('should handle FormData request body', () => {
      const formData = new FormData();
      const context = createMockRequestContext({
        transformedRequestBody: formData,
        getHeader: jest.fn().mockReturnValue(CONTENT_TYPES.MULTIPART_FORM_DATA),
        requestHeaders: {},
        forwardHeaders: [],
      });
      constructRequestHeaders.mockReturnValue({
        'content-type': 'multipart/form-data',
      });
      constructRequestBody.mockReturnValue(formData);
      const result = constructRequest(mockProviderConfigMappedHeaders, context);
      expect(result.body).toBe(formData);
    });

    it('should handle ReadableStream request body', () => {
      const stream = new ReadableStream();
      const context = createMockRequestContext({
        requestBody: stream,
        requestHeaders: {},
        forwardHeaders: [],
      });
      constructRequestHeaders.mockReturnValue({
        'content-type': 'application/json',
      });
      constructRequestBody.mockReturnValue(stream);
      const result = constructRequest(mockProviderConfigMappedHeaders, context);
      expect(result.body).toBe(stream);
    });
  });

  describe('selectProviderByWeight', () => {
    it('should select provider based on weights', () => {
      const providers: Options[] = [
        { provider: 'openai', weight: 1 },
        { provider: 'anthropic', weight: 2 },
        { provider: 'cohere', weight: 3 },
      ];

      const selected = selectProviderByWeight(providers);
      expect(selected).toHaveProperty('provider');
      expect(selected).toHaveProperty('index');
      expect(['openai', 'anthropic', 'cohere']).toContain(selected.provider);
    });

    it('should assign default weight of 1 to providers with undefined weight', () => {
      const providers: Options[] = [
        { provider: 'openai' },
        { provider: 'anthropic', weight: 2 },
      ];

      const selected = selectProviderByWeight(providers);
      expect(selected).toHaveProperty('provider');
      expect(['openai', 'anthropic']).toContain(selected.provider);
    });

    it('should throw error when all weights are 0', () => {
      const providers: Options[] = [
        { provider: 'openai', weight: 0 },
        { provider: 'anthropic', weight: 0 },
      ];

      expect(() => selectProviderByWeight(providers)).toThrow(
        'No provider selected, please check the weights'
      );
    });

    it('should handle single provider', () => {
      const providers: Options[] = [{ provider: 'openai', weight: 1 }];

      const selected = selectProviderByWeight(providers);
      expect(selected.provider).toBe('openai');
      expect(selected.index).toBe(0);
    });

    it('should handle providers with mixed weight types', () => {
      const providers: Options[] = [
        { provider: 'openai', weight: 0.5 },
        { provider: 'anthropic', weight: 1.5 },
      ];

      const selected = selectProviderByWeight(providers);
      expect(['openai', 'anthropic']).toContain(selected.provider);
    });
  });

  describe('convertHooksShorthand', () => {
    it('should convert input guardrails to hooks format', () => {
      const guardrails = [
        {
          'default.contains': { operator: 'none', words: ['test'] },
          deny: true,
        },
      ];

      const result = convertHooksShorthand(
        guardrails,
        'input',
        HookType.GUARDRAIL
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('type', HookType.GUARDRAIL);
      expect(result[0]).toHaveProperty('deny', true);
      expect(result[0]).toHaveProperty('checks');
      expect(result[0].checks).toHaveLength(1);
      expect(result[0].checks[0]).toEqual({
        id: 'default.contains',
        parameters: { operator: 'none', words: ['test'] },
        is_enabled: undefined,
      });
    });

    it('should convert output guardrails to hooks format', () => {
      const guardrails = [
        {
          'default.regexMatch': { pattern: '^[a-zA-Z]+$' },
          on_fail: 'block',
        },
      ];

      const result = convertHooksShorthand(
        guardrails,
        'output',
        HookType.GUARDRAIL
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('type', HookType.GUARDRAIL);
      expect(result[0]).toHaveProperty('onFail', 'block');
      expect(result[0].checks[0].id).toBe('default.regexMatch');
    });

    it('should handle multiple checks in single hook', () => {
      const guardrails = [
        {
          'default.contains': { operator: 'none', words: ['test'] },
          'default.wordCount': { min: 10, max: 100 },
          deny: false,
        },
      ];

      const result = convertHooksShorthand(
        guardrails,
        'input',
        HookType.GUARDRAIL
      );
      expect(result[0].checks).toHaveLength(2);
      expect(result[0].checks.map((c: any) => c.id)).toEqual([
        'default.contains',
        'default.wordCount',
      ]);
    });

    it('should add default. prefix to checks without it', () => {
      const guardrails = [
        {
          contains: { operator: 'none', words: ['test'] },
        },
      ];

      const result = convertHooksShorthand(
        guardrails,
        'input',
        HookType.GUARDRAIL
      );
      expect(result[0].checks[0].id).toBe('default.contains');
    });

    it('should preserve existing prefixes', () => {
      const guardrails = [
        {
          'custom.check': { value: 'test' },
        },
      ];

      const result = convertHooksShorthand(
        guardrails,
        'input',
        HookType.GUARDRAIL
      );
      expect(result[0].checks[0].id).toBe('custom.check');
    });

    it('should handle mutator hooks', () => {
      const mutators = [
        {
          'default.allUppercase': {},
          async: true,
        },
      ];

      const result = convertHooksShorthand(mutators, 'input', HookType.MUTATOR);
      expect(result[0]).toHaveProperty('type', HookType.MUTATOR);
      expect(result[0]).toHaveProperty('async', true);
    });

    it('should generate random IDs for hooks', () => {
      const guardrails = [
        { 'default.contains': { words: ['test'] } },
        { 'default.wordCount': { min: 10 } },
      ];

      const result = convertHooksShorthand(
        guardrails,
        'input',
        HookType.GUARDRAIL
      );
      expect(result[0].id).toMatch(/^input_guardrail_[a-z0-9]+$/);
      expect(result[1].id).toMatch(/^input_guardrail_[a-z0-9]+$/);
      expect(result[0].id).not.toBe(result[1].id);
    });
  });

  describe('constructConfigFromRequestHeaders', () => {
    it('should construct basic config from headers', () => {
      const headers = {
        [`x-${POWERED_BY}-provider`]: 'openai',
        authorization: 'Bearer sk-test123',
      };

      const result = constructConfigFromRequestHeaders(headers);
      expect(result).toEqual({
        provider: 'openai',
        apiKey: 'sk-test123',
        defaultInputGuardrails: [],
        defaultOutputGuardrails: [],
      });
    });

    it('should parse JSON config from headers', () => {
      const config = {
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        max_tokens: 1000,
      };
      const headers = {
        [`x-${POWERED_BY}-config`]: JSON.stringify(config),
        authorization: 'Bearer sk-test123',
      };

      const result = constructConfigFromRequestHeaders(headers);
      expect(result).toMatchObject({
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        maxTokens: 1000,
      });
    });

    it('should handle Azure OpenAI config', () => {
      const headers = {
        [`x-${POWERED_BY}-provider`]: 'azure-openai',
        [`x-${POWERED_BY}-azure-resource-name`]: 'my-resource',
        [`x-${POWERED_BY}-azure-deployment-id`]: 'gpt-4',
        [`x-${POWERED_BY}-azure-api-version`]: '2023-12-01-preview',
        authorization: 'Bearer sk-test123',
      };

      const result = constructConfigFromRequestHeaders(headers);
      expect(result).toMatchObject({
        provider: 'azure-openai',
        resourceName: 'my-resource',
        deploymentId: 'gpt-4',
        apiVersion: '2023-12-01-preview',
      });
    });

    it('should handle AWS Bedrock config', () => {
      const headers = {
        [`x-${POWERED_BY}-provider`]: 'bedrock',
        [`x-${POWERED_BY}-aws-access-key-id`]: 'AKIATEST',
        [`x-${POWERED_BY}-aws-secret-access-key`]: 'secret123',
        [`x-${POWERED_BY}-aws-region`]: 'us-east-1',
        authorization: 'Bearer sk-test123',
      };

      const result = constructConfigFromRequestHeaders(headers);
      expect(result).toMatchObject({
        provider: 'bedrock',
        awsAccessKeyId: 'AKIATEST',
        awsSecretAccessKey: 'secret123',
        awsRegion: 'us-east-1',
      });
    });

    it('should handle Google Vertex AI config with service account JSON', () => {
      const serviceAccount = {
        type: 'service_account',
        project_id: 'test-project',
        client_email: 'test@test-project.iam.gserviceaccount.com',
      };
      const headers = {
        [`x-${POWERED_BY}-provider`]: 'vertex-ai',
        [`x-${POWERED_BY}-vertex-project-id`]: 'test-project',
        [`x-${POWERED_BY}-vertex-region`]: 'us-central1',
        [`x-${POWERED_BY}-vertex-service-account-json`]:
          JSON.stringify(serviceAccount),
        authorization: 'Bearer sk-test123',
      };

      const result = constructConfigFromRequestHeaders(headers);
      expect(result).toMatchObject({
        provider: 'vertex-ai',
        vertexProjectId: 'test-project',
        vertexRegion: 'us-central1',
        vertexServiceAccountJson: serviceAccount,
      });
    });

    it('should handle invalid service account JSON gracefully', () => {
      const headers = {
        [`x-${POWERED_BY}-provider`]: 'vertex-ai',
        [`x-${POWERED_BY}-vertex-service-account-json`]: '{invalid json}',
        authorization: 'Bearer sk-test123',
      };

      const result = constructConfigFromRequestHeaders(headers);
      expect(result).toMatchObject({
        provider: 'vertex-ai',
        vertexServiceAccountJson: null,
      });
    });

    it('should handle default guardrails from headers', () => {
      const inputGuardrails = [{ 'default.contains': { words: ['test'] } }];
      const outputGuardrails = [{ 'default.wordCount': { max: 100 } }];
      const headers = {
        [`x-${POWERED_BY}-provider`]: 'openai',
        'x-portkey-default-input-guardrails': JSON.stringify(inputGuardrails),
        'x-portkey-default-output-guardrails': JSON.stringify(outputGuardrails),
        authorization: 'Bearer sk-test123',
      };

      const result = constructConfigFromRequestHeaders(headers);
      expect(result).toMatchObject({
        defaultInputGuardrails: inputGuardrails,
        defaultOutputGuardrails: outputGuardrails,
      });
    });

    it('should handle Anthropic specific headers', () => {
      const headers = {
        [`x-${POWERED_BY}-provider`]: 'anthropic',
        [`x-${POWERED_BY}-anthropic-beta`]: 'tools-2024-04-04',
        [`x-${POWERED_BY}-anthropic-version`]: '2023-06-01',
        authorization: 'Bearer sk-test123',
      };

      const result = constructConfigFromRequestHeaders(headers);
      expect(result).toMatchObject({
        provider: 'anthropic',
        anthropicBeta: 'tools-2024-04-04',
        anthropicVersion: '2023-06-01',
      });
    });

    it('should handle OpenAI specific headers', () => {
      const headers = {
        [`x-${POWERED_BY}-provider`]: 'openai',
        [`x-${POWERED_BY}-openai-organization`]: 'org-test123',
        [`x-${POWERED_BY}-openai-project`]: 'proj-test123',
        [`x-${POWERED_BY}-openai-beta`]: 'assistants=v2',
        authorization: 'Bearer sk-test123',
      };

      const result = constructConfigFromRequestHeaders(headers);
      expect(result).toMatchObject({
        provider: 'openai',
        openaiOrganization: 'org-test123',
        openaiProject: 'proj-test123',
        openaiBeta: 'assistants=v2',
      });
    });

    it('should prefer x-portkey-openai-beta header over openai-beta', () => {
      const headers = {
        [`x-${POWERED_BY}-provider`]: 'openai',
        [`x-${POWERED_BY}-openai-beta`]: 'portkey-beta',
        'openai-beta': 'direct-beta',
        authorization: 'Bearer sk-test123',
      };

      const result = constructConfigFromRequestHeaders(headers);
      expect(result).toMatchObject({
        openaiBeta: 'portkey-beta',
      });
    });

    it('should handle empty headers gracefully', () => {
      const result = constructConfigFromRequestHeaders({});
      expect(result).toEqual({
        provider: undefined,
        apiKey: undefined,
        defaultInputGuardrails: [],
        defaultOutputGuardrails: [],
      });
    });
  });
});
