import { Context } from 'hono';
import { DEMONROUTE } from '../../globals';
import DemonRouteConfig from './index';
import DemonRouteAPIConfig from './api';

describe('DemonRoute Provider Integration Tests', () => {
  describe('DemonRouteAPIConfig', () => {
    it('should return the correct base URL', () => {
      expect(
        DemonRouteAPIConfig.getBaseURL({
          providerOptions: { provider: DEMONROUTE },
        } as any)
      ).toBe('https://api.demonroute.com/v1');
    });

    it('should generate correct authorization headers with apiKey', () => {
      const mockOptions = { provider: DEMONROUTE, apiKey: 'dr-test-key-12345' };
      const headers = DemonRouteAPIConfig.headers({
        c: {} as Context,
        providerOptions: mockOptions,
        fn: 'chatComplete',
        transformedRequestBody: {},
        transformedRequestUrl: '',
      });

      expect(headers).toEqual({
        Authorization: 'Bearer dr-test-key-12345',
      });
    });

    it('should return correct endpoints for supported functions', () => {
      expect(
        DemonRouteAPIConfig.getEndpoint({ fn: 'chatComplete' } as any)
      ).toBe('/chat/completions');
      expect(DemonRouteAPIConfig.getEndpoint({ fn: 'complete' } as any)).toBe(
        '/completions'
      );
      expect(DemonRouteAPIConfig.getEndpoint({ fn: 'embed' } as any)).toBe('');
    });
  });

  describe('DemonRouteConfig', () => {
    it('should be correctly configured', () => {
      expect(DemonRouteConfig).toBeDefined();
    });

    it('should have chatComplete and complete configs defined', () => {
      expect(DemonRouteConfig.chatComplete).toBeDefined();
      expect(DemonRouteConfig.complete).toBeDefined();
      expect(DemonRouteConfig.api).toBe(DemonRouteAPIConfig);
    });

    it('should transform chatComplete response correctly and attach provider', () => {
      const transform = DemonRouteConfig.responseTransforms?.chatComplete;
      expect(transform).toBeDefined();

      const mockResponse = {
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: 1730190000,
        model: 'shoukewei/Qwen3.8-27B-OBLITERATED22-AGENT',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello from DemonRoute!' },
            finish_reason: 'stop',
          },
        ],
      };

      const transformed = (transform as Function)(mockResponse, 200);
      expect(transformed).toBeDefined();
      expect(transformed.provider).toBe(DEMONROUTE);
      expect(transformed.choices[0].message.content).toBe(
        'Hello from DemonRoute!'
      );
    });

    it('should transform complete response correctly and attach provider', () => {
      const transform = DemonRouteConfig.responseTransforms?.complete;
      expect(transform).toBeDefined();

      const mockResponse = {
        id: 'cmpl-test',
        object: 'text_completion',
        created: 1730190000,
        model: 'shoukewei/Qwen3.8-27B-OBLITERATED22-AGENT',
        choices: [
          {
            text: 'Completed text',
            index: 0,
            finish_reason: 'stop',
          },
        ],
      };

      const transformed = (transform as Function)(mockResponse, 200);
      expect(transformed).toBeDefined();
      expect(transformed.provider).toBe(DEMONROUTE);
      expect(transformed.choices[0].text).toBe('Completed text');
    });

    it('should handle error responses gracefully', () => {
      const transform = DemonRouteConfig.responseTransforms?.chatComplete;
      const mockErrorResponse = {
        error: {
          message: 'Invalid API Key',
          type: 'authentication_error',
          code: 'invalid_api_key',
        },
      };

      const transformed = (transform as Function)(mockErrorResponse, 401);
      expect(transformed).toBeDefined();
      expect(transformed.error).toBeDefined();
      expect(transformed.provider).toBe(DEMONROUTE);
    });
  });
});
