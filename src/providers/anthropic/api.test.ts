import AnthropicAPIConfig from './api';

const createMockContext = (headers: Record<string, string> = {}) => ({
  req: {
    header: (name: string) => headers[name.toLowerCase()],
  },
});

describe('AnthropicAPIConfig', () => {
  describe('headers', () => {
    it('should use anthropicBeta from providerOptions when available', () => {
      const result = AnthropicAPIConfig.headers({
        c: createMockContext() as any,
        providerOptions: {
          apiKey: 'test-key',
          provider: 'anthropic',
          anthropicBeta: 'prompt-caching-scope-2026-01-05',
        },
        fn: 'chatComplete',
        transformedRequestBody: {},
        transformedRequestUrl: '',
        gatewayRequestBody: {},
      });

      expect(result).toEqual(
        expect.objectContaining({
          'anthropic-beta': 'prompt-caching-scope-2026-01-05',
        })
      );
    });

    it('should use anthropic_beta from request body when providerOptions lacks it', () => {
      const result = AnthropicAPIConfig.headers({
        c: createMockContext() as any,
        providerOptions: { apiKey: 'test-key', provider: 'anthropic' },
        fn: 'chatComplete',
        transformedRequestBody: {},
        transformedRequestUrl: '',
        gatewayRequestBody: {
          anthropic_beta: 'prompt-caching-scope-2026-01-05',
        } as any,
      });

      expect(result).toEqual(
        expect.objectContaining({
          'anthropic-beta': 'prompt-caching-scope-2026-01-05',
        })
      );
    });

    it('should fall back to reading anthropic-beta from request headers via Hono context', () => {
      const result = AnthropicAPIConfig.headers({
        c: createMockContext({
          'anthropic-beta': 'prompt-caching-scope-2026-01-05',
        }) as any,
        providerOptions: { apiKey: 'test-key', provider: 'anthropic' },
        fn: 'chatComplete',
        transformedRequestBody: {},
        transformedRequestUrl: '',
        gatewayRequestBody: {},
      });

      expect(result).toEqual(
        expect.objectContaining({
          'anthropic-beta': 'prompt-caching-scope-2026-01-05',
        })
      );
    });

    it('should fall back to reading anthropic-version from request headers via Hono context', () => {
      const result = AnthropicAPIConfig.headers({
        c: createMockContext({
          'anthropic-version': '2024-01-01',
        }) as any,
        providerOptions: { apiKey: 'test-key', provider: 'anthropic' },
        fn: 'chatComplete',
        transformedRequestBody: {},
        transformedRequestUrl: '',
        gatewayRequestBody: {},
      });

      expect(result).toEqual(
        expect.objectContaining({
          'anthropic-version': '2024-01-01',
        })
      );
    });

    it('should use default beta header when no source provides it', () => {
      const result = AnthropicAPIConfig.headers({
        c: createMockContext() as any,
        providerOptions: { apiKey: 'test-key', provider: 'anthropic' },
        fn: 'chatComplete',
        transformedRequestBody: {},
        transformedRequestUrl: '',
        gatewayRequestBody: {},
      });

      expect(result).toEqual(
        expect.objectContaining({
          'anthropic-beta': 'messages-2023-12-15',
          'anthropic-version': '2023-06-01',
        })
      );
    });

    it('should prefer providerOptions over request headers', () => {
      const result = AnthropicAPIConfig.headers({
        c: createMockContext({
          'anthropic-beta': 'from-request-header',
        }) as any,
        providerOptions: {
          apiKey: 'test-key',
          anthropicBeta: 'from-provider-options',
          provider: 'anthropic',
        },
        fn: 'chatComplete',
        transformedRequestBody: {},
        transformedRequestUrl: '',
        gatewayRequestBody: {},
      });

      expect(result).toEqual(
        expect.objectContaining({
          'anthropic-beta': 'from-provider-options',
        })
      );
    });
  });
});
