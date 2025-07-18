import { ProviderContext } from '../../../../../src/handlers/services/providerContext';
import { RequestContext } from '../../../../../src/handlers/services/requestContext';
import Providers from '../../../../../src/providers';
import { ANTHROPIC, AZURE_OPEN_AI } from '../../../../../src/globals';

// Mock the Providers object
jest.mock('../../../providers', () => ({
  openai: {
    api: {
      headers: jest.fn(),
      getBaseURL: jest.fn(),
      getEndpoint: jest.fn(),
      getProxyEndpoint: jest.fn(),
    },
    requestHandlers: {
      uploadFile: jest.fn(),
      listFiles: jest.fn(),
    },
  },
  anthropic: {
    api: {
      headers: jest.fn(),
      getBaseURL: jest.fn(),
      getEndpoint: jest.fn(),
    },
    requestHandlers: {},
  },
  'azure-openai': {
    api: {
      headers: jest.fn(),
      getBaseURL: jest.fn(),
      getEndpoint: jest.fn(),
    },
  },
}));

describe('ProviderContext', () => {
  let mockRequestContext: RequestContext;

  beforeEach(() => {
    // Clean up any previous mocks
    if (Providers.openai.api.getProxyEndpoint) {
      delete Providers.openai.api.getProxyEndpoint;
    }

    mockRequestContext = {
      honoContext: {
        req: { url: 'https://gateway.example.com/v1/chat/completions' },
      },
      providerOption: { provider: 'openai', apiKey: 'sk-test' },
      endpoint: 'chatComplete',
      transformedRequestBody: { model: 'gpt-4', messages: [] },
      params: { model: 'gpt-4', messages: [] },
    } as unknown as RequestContext;
  });

  describe('constructor', () => {
    it('should create provider context for valid provider', () => {
      const context = new ProviderContext('openai');
      expect(context).toBeInstanceOf(ProviderContext);
    });

    it('should throw error for invalid provider', () => {
      expect(() => new ProviderContext('invalid-provider')).toThrow(
        'Provider invalid-provider not found'
      );
    });
  });

  describe('providerConfig getter', () => {
    it('should return provider config', () => {
      const context = new ProviderContext('openai');
      expect(context.providerConfig).toBe(Providers.openai);
    });
  });

  describe('apiConfig getter', () => {
    it('should return API config', () => {
      const context = new ProviderContext('openai');
      expect(context.apiConfig).toBe(Providers.openai.api);
    });
  });

  describe('getHeaders', () => {
    it('should call provider headers function with correct parameters', async () => {
      const mockHeaders = { authorization: 'Bearer sk-test' };
      const mockHeadersFn = jest.fn().mockResolvedValue(mockHeaders);
      Providers.openai.api.headers = mockHeadersFn;

      const context = new ProviderContext('openai');
      const result = await context.getHeaders(mockRequestContext);

      expect(mockHeadersFn).toHaveBeenCalledWith({
        c: mockRequestContext.honoContext,
        providerOptions: mockRequestContext.providerOption,
        fn: mockRequestContext.endpoint,
        transformedRequestBody: mockRequestContext.transformedRequestBody,
        transformedRequestUrl: mockRequestContext.honoContext.req.url,
        gatewayRequestBody: mockRequestContext.params,
      });
      expect(result).toBe(mockHeaders);
    });

    it('should handle async header generation', async () => {
      const mockHeaders = { 'x-api-key': 'test-key' };
      const mockHeadersFn = jest.fn().mockResolvedValue(mockHeaders);
      Providers.openai.api.headers = mockHeadersFn;

      const context = new ProviderContext('openai');
      const result = await context.getHeaders(mockRequestContext);

      expect(result).toEqual(mockHeaders);
    });
  });

  describe('getBaseURL', () => {
    it('should call provider getBaseURL function with correct parameters', async () => {
      const mockBaseURL = 'https://api.openai.com';
      const mockGetBaseURL = jest.fn().mockResolvedValue(mockBaseURL);
      Providers.openai.api.getBaseURL = mockGetBaseURL;

      const context = new ProviderContext('openai');
      const result = await context.getBaseURL(mockRequestContext);

      expect(mockGetBaseURL).toHaveBeenCalledWith({
        providerOptions: mockRequestContext.providerOption,
        fn: mockRequestContext.endpoint,
        c: mockRequestContext.honoContext,
        gatewayRequestURL: mockRequestContext.honoContext.req.url,
      });
      expect(result).toBe(mockBaseURL);
    });

    it('should handle custom base URLs', async () => {
      const customURL = 'https://custom.openai.com';
      const mockGetBaseURL = jest.fn().mockResolvedValue(customURL);
      Providers.openai.api.getBaseURL = mockGetBaseURL;

      const context = new ProviderContext('openai');
      const result = await context.getBaseURL(mockRequestContext);

      expect(result).toBe(customURL);
    });
  });

  describe('getEndpointPath', () => {
    it('should call provider getEndpoint function with correct parameters', () => {
      const mockEndpoint = '/v1/chat/completions';
      const mockGetEndpoint = jest.fn().mockReturnValue(mockEndpoint);
      Providers.openai.api.getEndpoint = mockGetEndpoint;

      const context = new ProviderContext('openai');
      const result = context.getEndpointPath(mockRequestContext);

      expect(mockGetEndpoint).toHaveBeenCalledWith({
        c: mockRequestContext.honoContext,
        providerOptions: mockRequestContext.providerOption,
        fn: mockRequestContext.endpoint,
        gatewayRequestBodyJSON: mockRequestContext.params,
        gatewayRequestBody: {},
        gatewayRequestURL: mockRequestContext.honoContext.req.url,
      });
      expect(result).toBe(mockEndpoint);
    });
  });

  describe('getProxyPath', () => {
    it('should handle regular proxy path construction', () => {
      const mockContext = {
        ...mockRequestContext,
        honoContext: {
          req: {
            url: 'https://gateway.example.com/v1/proxy/chat/completions?model=gpt-4',
          },
        },
      } as RequestContext;

      const context = new ProviderContext('openai');
      const result = context.getProxyPath(
        mockContext,
        'https://api.openai.com'
      );

      expect(result).toBe(
        'https://api.openai.com/chat/completions?model=gpt-4'
      );
    });

    it('should handle Azure OpenAI special case', () => {
      const mockContext = {
        ...mockRequestContext,
        honoContext: {
          req: {
            url: 'https://gateway.example.com/v1/proxy/myresource.openai.azure.com/openai/deployments/gpt-4/chat/completions',
          },
        },
      } as RequestContext;

      const context = new ProviderContext(AZURE_OPEN_AI);
      const result = context.getProxyPath(
        mockContext,
        'https://api.openai.com'
      );

      expect(result).toBe(
        'https://myresource.openai.azure.com/openai/deployments/gpt-4/chat/completions'
      );
    });

    it('should use provider-specific getProxyEndpoint when available', () => {
      const mockGetProxyEndpoint = jest
        .fn()
        .mockReturnValue('/custom/endpoint');
      Providers.openai.api.getProxyEndpoint = mockGetProxyEndpoint;

      const mockContext = {
        ...mockRequestContext,
        honoContext: {
          req: { url: 'https://gateway.example.com/v1/proxy/chat/completions' },
        },
      } as RequestContext;

      const context = new ProviderContext('openai');
      const result = context.getProxyPath(
        mockContext,
        'https://api.openai.com'
      );

      expect(mockGetProxyEndpoint).toHaveBeenCalledWith({
        reqPath: '/chat/completions',
        reqQuery: '',
        providerOptions: mockRequestContext.providerOption,
      });
      expect(result).toBe('https://api.openai.com/custom/endpoint');

      // Clean up the mock
      delete Providers.openai.api.getProxyEndpoint;
    });

    it('should handle Anthropic double v1 path fix', () => {
      const mockContext = {
        ...mockRequestContext,
        honoContext: {
          req: { url: 'https://gateway.example.com/v1/v1/messages' },
        },
      } as RequestContext;

      const context = new ProviderContext(ANTHROPIC);
      const result = context.getProxyPath(
        mockContext,
        'https://api.anthropic.com'
      );

      expect(result).toBe('https://api.anthropic.com/v1/messages');
    });

    it('should handle /v1 proxy endpoint path', () => {
      const mockContext = {
        ...mockRequestContext,
        honoContext: {
          req: { url: 'https://gateway.example.com/v1/chat/completions' },
        },
      } as RequestContext;

      const context = new ProviderContext('openai');
      const result = context.getProxyPath(
        mockContext,
        'https://api.openai.com'
      );

      expect(result).toBe('https://api.openai.com/chat/completions');
    });

    it('should handle query parameters', () => {
      const mockContext = {
        ...mockRequestContext,
        honoContext: {
          req: {
            url: 'https://gateway.example.com/v1/proxy/files?purpose=fine-tune&limit=10',
          },
        },
      } as RequestContext;

      const context = new ProviderContext('openai');
      const result = context.getProxyPath(
        mockContext,
        'https://api.openai.com'
      );

      expect(result).toBe(
        'https://api.openai.com/files?purpose=fine-tune&limit=10'
      );
    });
  });

  describe('getFullURL', () => {
    it('should return proxy path for proxy endpoint', async () => {
      const mockContext = {
        ...mockRequestContext,
        endpoint: 'proxy',
        customHost: '',
        honoContext: {
          req: { url: 'https://gateway.example.com/v1/proxy/chat/completions' },
        },
      } as RequestContext;

      const mockGetBaseURL = jest
        .fn()
        .mockResolvedValue('https://api.openai.com');
      Providers.openai.api.getBaseURL = mockGetBaseURL;

      const context = new ProviderContext('openai');
      const result = await context.getFullURL(mockContext);

      expect(result).toBe('https://api.openai.com/chat/completions');
    });

    it('should return standard endpoint URL for non-proxy endpoints', async () => {
      const mockGetBaseURL = jest
        .fn()
        .mockResolvedValue('https://api.openai.com');
      const mockGetEndpoint = jest.fn().mockReturnValue('/v1/chat/completions');
      Providers.openai.api.getBaseURL = mockGetBaseURL;
      Providers.openai.api.getEndpoint = mockGetEndpoint;

      const context = new ProviderContext('openai');
      const result = await context.getFullURL(mockRequestContext);

      expect(result).toBe('https://api.openai.com/v1/chat/completions');
    });

    it('should use custom host when provided', async () => {
      const mockContext = {
        ...mockRequestContext,
        customHost: 'https://custom.openai.com',
      } as RequestContext;

      const mockGetEndpoint = jest.fn().mockReturnValue('/v1/chat/completions');
      Providers.openai.api.getEndpoint = mockGetEndpoint;

      const context = new ProviderContext('openai');
      const result = await context.getFullURL(mockContext);

      expect(result).toBe('https://custom.openai.com/v1/chat/completions');
    });
  });

  describe('requestHandlers getter', () => {
    it('should return request handlers from provider config', () => {
      const context = new ProviderContext('openai');
      expect(context.requestHandlers).toBe(Providers.openai.requestHandlers);
    });

    it('should return empty object when no request handlers', () => {
      const context = new ProviderContext('anthropic');
      expect(context.requestHandlers).toEqual({});
    });
  });

  describe('hasRequestHandler', () => {
    it('should return true when handler exists', () => {
      const mockContext = {
        ...mockRequestContext,
        endpoint: 'uploadFile',
      } as RequestContext;

      const context = new ProviderContext('openai');
      expect(context.hasRequestHandler(mockContext)).toBe(true);
    });

    it('should return false when handler does not exist', () => {
      const mockContext = {
        ...mockRequestContext,
        endpoint: 'chatComplete',
      } as RequestContext;

      const context = new ProviderContext('openai');
      expect(context.hasRequestHandler(mockContext)).toBe(false);
    });

    it('should return false when no request handlers', () => {
      const context = new ProviderContext('anthropic');
      expect(context.hasRequestHandler(mockRequestContext)).toBe(false);
    });
  });

  describe('getRequestHandler', () => {
    it('should return wrapped handler function when handler exists', () => {
      const mockHandler = jest.fn().mockResolvedValue(new Response('success'));
      Providers.openai.requestHandlers!.uploadFile = mockHandler;

      const mockContext = {
        ...mockRequestContext,
        endpoint: 'uploadFile',
        honoContext: { req: { url: 'https://gateway.com/v1/files' } },
        requestHeaders: { authorization: 'Bearer sk-test' },
        requestBody: new FormData(),
      } as unknown as RequestContext;

      const context = new ProviderContext('openai');
      const handlerWrapper = context.getRequestHandler(mockContext);

      expect(handlerWrapper).toBeInstanceOf(Function);
    });

    it('should return undefined when handler does not exist', () => {
      const mockContext = {
        ...mockRequestContext,
        endpoint: 'chatComplete',
      } as RequestContext;

      const context = new ProviderContext('openai');
      const result = context.getRequestHandler(mockContext);

      expect(result).toBeUndefined();
    });

    it('should call handler with correct parameters when executed', async () => {
      const mockHandler = jest.fn().mockResolvedValue(new Response('success'));
      Providers.openai.requestHandlers!.uploadFile = mockHandler;

      const mockContext = {
        ...mockRequestContext,
        endpoint: 'uploadFile',
        honoContext: { req: { url: 'https://gateway.com/v1/files' } },
        requestHeaders: { authorization: 'Bearer sk-test' },
        requestBody: new FormData(),
      } as unknown as RequestContext;

      const context = new ProviderContext('openai');
      const handlerWrapper = context.getRequestHandler(mockContext);

      if (handlerWrapper) {
        await handlerWrapper();

        expect(mockHandler).toHaveBeenCalledWith({
          c: mockContext.honoContext,
          providerOptions: mockContext.providerOption,
          requestURL: mockContext.honoContext.req.url,
          requestHeaders: mockContext.requestHeaders,
          requestBody: mockContext.requestBody,
        });
      }
    });

    it('should return undefined when requestHandlers is undefined', () => {
      // Create a provider without requestHandlers
      Providers['test-provider'] = {
        api: {
          headers: jest.fn(),
          getBaseURL: jest.fn(),
          getEndpoint: jest.fn(),
        },
      };

      const context = new ProviderContext('test-provider');
      const result = context.getRequestHandler(mockRequestContext);

      expect(result).toBeUndefined();

      // Clean up
      delete Providers['test-provider'];
    });
  });
});
