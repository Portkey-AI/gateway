import MoonshotAPIConfig from './api';
import {
  MoonshotChatCompleteConfig,
  MoonshotChatCompleteResponseTransform,
  MoonshotChatCompleteStreamChunkTransform,
} from './chatComplete';
import { MOONSHOT } from '../../globals';
import modelsData from '../../data/models.json';
import { ParameterConfig } from '../types';

describe('Moonshot Provider Config and Transforms', () => {
  describe('MoonshotAPIConfig', () => {
    it('returns the correct base URL', () => {
      expect(MoonshotAPIConfig.getBaseURL({} as any)).toBe(
        'https://api.moonshot.cn'
      );
    });

    it('generates the authorization header with API key', () => {
      const headers = MoonshotAPIConfig.headers({
        providerOptions: { provider: 'moonshot', apiKey: 'test-moonshot-key' },
        fn: 'chatComplete',
      } as any);
      expect(headers).toEqual({ Authorization: 'Bearer test-moonshot-key' });
    });

    it('resolves chatComplete endpoint', () => {
      expect(
        MoonshotAPIConfig.getEndpoint({
          fn: 'chatComplete',
          gatewayRequestBody: {},
        } as any)
      ).toBe('/v1/chat/completions');
    });

    it('returns empty string for unsupported endpoints', () => {
      expect(
        MoonshotAPIConfig.getEndpoint({
          fn: 'embed' as any,
          gatewayRequestBody: {},
        } as any)
      ).toBe('');
    });
  });

  describe('MoonshotChatCompleteConfig', () => {
    const messagesConfig = MoonshotChatCompleteConfig.messages as
      | ParameterConfig
      | undefined;

    it('maps developer role to system role', () => {
      const transform = messagesConfig?.transform;
      expect(transform).toBeDefined();
      if (transform) {
        const result = transform(
          {
            messages: [
              { role: 'developer', content: 'You are helpful.' },
              { role: 'user', content: 'Hello' },
            ],
          },
          {} as any
        );
        expect(result).toEqual([
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hello' },
        ]);
      }
    });

    it('keeps system and user roles intact', () => {
      const transform = messagesConfig?.transform;
      if (transform) {
        const result = transform(
          {
            messages: [
              { role: 'system', content: 'Prompt' },
              { role: 'user', content: 'Query' },
            ],
          },
          {} as any
        );
        expect(result).toEqual([
          { role: 'system', content: 'Prompt' },
          { role: 'user', content: 'Query' },
        ]);
      }
    });
  });

  describe('MoonshotChatCompleteResponseTransform', () => {
    it('transforms modern kimi-k3 response correctly', () => {
      const rawResponse = {
        id: 'cmpl-kimi-12345',
        object: 'chat.completion',
        created: 1722000000,
        model: 'kimi-k3',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant' as const,
              content: 'Hello! I am Kimi K3.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 15,
          completion_tokens: 8,
          total_tokens: 23,
        },
      };

      const transformed = MoonshotChatCompleteResponseTransform(
        rawResponse,
        200
      );
      expect(transformed).toEqual({
        id: 'cmpl-kimi-12345',
        object: 'chat.completion',
        created: 1722000000,
        model: 'kimi-k3',
        provider: MOONSHOT,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello! I am Kimi K3.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 15,
          completion_tokens: 8,
          total_tokens: 23,
        },
      });
    });

    it('transforms legacy moonshot-v1 model response correctly', () => {
      const rawResponse = {
        id: 'cmpl-legacy-8k',
        object: 'chat.completion',
        created: 1720000000,
        model: 'moonshot-v1-8k',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant' as const,
              content: 'Legacy reply',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      const transformed = MoonshotChatCompleteResponseTransform(
        rawResponse,
        200
      );
      expect(transformed).toMatchObject({
        id: 'cmpl-legacy-8k',
        model: 'moonshot-v1-8k',
        provider: MOONSHOT,
      });
    });

    it('transforms error response correctly when responseStatus is not 200', () => {
      const errorResponse = {
        object: 'error',
        message: 'Invalid API key provided',
        type: 'invalid_request_error',
        param: null,
        code: 'invalid_api_key',
      };

      const transformed = MoonshotChatCompleteResponseTransform(
        errorResponse,
        401
      );
      expect(transformed).toEqual({
        error: {
          message: 'moonshot error: Invalid API key provided',
          type: 'invalid_request_error',
          param: null,
          code: 'invalid_api_key',
        },
        provider: MOONSHOT,
      });
    });
  });

  describe('MoonshotChatCompleteStreamChunkTransform', () => {
    it('transforms streaming chunks with modern model ID', () => {
      const chunk = JSON.stringify({
        id: 'cmpl-stream-123',
        object: 'chat.completion.chunk',
        created: 1722000000,
        model: 'kimi-k3',
        choices: [
          {
            index: 0,
            delta: { role: 'assistant', content: 'Stream chunk' },
            finish_reason: null,
          },
        ],
      });

      const transformed = MoonshotChatCompleteStreamChunkTransform(
        `data: ${chunk}\n\n`
      );
      expect(transformed).toBe(
        `data: ${JSON.stringify({
          id: 'cmpl-stream-123',
          object: 'chat.completion.chunk',
          created: 1722000000,
          model: 'kimi-k3',
          provider: MOONSHOT,
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: 'Stream chunk' },
              finish_reason: null,
            },
          ],
        })}\n\n`
      );
    });

    it('forwards [DONE] chunk unchanged', () => {
      expect(MoonshotChatCompleteStreamChunkTransform('data: [DONE]\n\n')).toBe(
        'data: [DONE]\n\n'
      );
    });
  });

  describe('Moonshot models catalog in models.json', () => {
    const moonshotModels = modelsData.data.filter(
      (m: any) => m.provider?.id === 'moonshot'
    );

    it('includes all expected modern Kimi models', () => {
      const modelIds = moonshotModels.map((m: any) => m.id);
      expect(modelIds).toContain('kimi-k3');
      expect(modelIds).toContain('kimi-k2.7-code');
      expect(modelIds).toContain('kimi-k2.6');
      expect(modelIds).toContain('kimi-k2.5');
    });

    it('includes legacy moonshot-v1 models', () => {
      const modelIds = moonshotModels.map((m: any) => m.id);
      expect(modelIds).toContain('moonshot-v1-8k');
      expect(modelIds).toContain('moonshot-v1-32k');
      expect(modelIds).toContain('moonshot-v1-128k');
    });

    it('verifies moonshot-v1-32k typo is fixed', () => {
      const model32k = moonshotModels.find(
        (m: any) => m.id === 'moonshot-v1-32k'
      );
      expect(model32k?.name).toBe('Moonshot (32k Context)');
    });
  });
});
