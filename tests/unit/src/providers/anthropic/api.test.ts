import AnthropicAPIConfig from '../../../../../src/providers/anthropic/api';
import { version as packageVersion } from '../../../../../package.json';

describe('AnthropicAPIConfig', () => {
  describe('headers', () => {
    it('includes User-Agent header with package version', () => {
      const headers = AnthropicAPIConfig.headers({
        c: {} as any,
        providerOptions: { provider: 'anthropic', apiKey: 'test-key' } as any,
        fn: 'chatComplete',
        transformedRequestBody: {},
        transformedRequestUrl: '',
      }) as Record<string, string>;

      expect(headers).toHaveProperty('User-Agent');
      expect(headers['User-Agent']).toBe(
        `portkey-ai-gateway/${packageVersion}`
      );
      expect(headers['User-Agent']).toMatch(/^portkey-ai-gateway\//);
    });

    it('includes X-API-Key header from providerOptions', () => {
      const headers = AnthropicAPIConfig.headers({
        c: {} as any,
        providerOptions: { provider: 'anthropic', apiKey: 'my-api-key' } as any,
        fn: 'chatComplete',
        transformedRequestBody: {},
        transformedRequestUrl: '',
      }) as Record<string, string>;

      expect(headers['X-API-Key']).toBe('my-api-key');
    });
  });
});
