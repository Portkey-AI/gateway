import { MINIMAX } from '../globals';
import MiniMaxAPIConfig from '../providers/minimax/api';
import {
  MiniMaxChatCompleteResponseTransform,
  MiniMaxChatCompleteStreamChunkTransform,
} from '../providers/minimax/chatComplete';
import MiniMaxConfig from '../providers/minimax';

describe('MiniMax provider', () => {
  test('MINIMAX constant has correct value', () => {
    expect(MINIMAX).toBe('minimax');
  });

  test('provider config has chatComplete and api', () => {
    expect(MiniMaxConfig.chatComplete).toBeDefined();
    expect(MiniMaxConfig.api).toBeDefined();
    expect(MiniMaxConfig.responseTransforms).toBeDefined();
  });

  describe('API config', () => {
    test('base URL is correct', () => {
      expect(MiniMaxAPIConfig.getBaseURL({} as any)).toBe(
        'https://api.minimax.io/v1'
      );
    });

    test('headers include Bearer auth', () => {
      const headers = MiniMaxAPIConfig.headers({
        providerOptions: { apiKey: 'test-key' },
      } as any);
      expect(headers).toEqual({
        Authorization: 'Bearer test-key',
      });
    });

    test('getEndpoint returns /chat/completions for chatComplete', () => {
      expect(MiniMaxAPIConfig.getEndpoint({ fn: 'chatComplete' } as any)).toBe(
        '/chat/completions'
      );
    });

    test('getEndpoint returns empty string for unknown fn', () => {
      expect(MiniMaxAPIConfig.getEndpoint({ fn: 'unknown' } as any)).toBe('');
    });
  });

  describe('chatComplete config', () => {
    const chatCompleteConfig = MiniMaxConfig.chatComplete;

    test('model param is configured', () => {
      expect(chatCompleteConfig.model).toBeDefined();
      expect(chatCompleteConfig.model.param).toBe('model');
      expect(chatCompleteConfig.model.required).toBe(true);
    });

    test('temperature default is 1', () => {
      expect(chatCompleteConfig.temperature).toBeDefined();
      expect(chatCompleteConfig.temperature.default).toBe(1);
    });

    test('messages param is configured', () => {
      expect(chatCompleteConfig.messages).toBeDefined();
      expect(chatCompleteConfig.messages.param).toBe('messages');
    });

    test('stream param is configured', () => {
      expect(chatCompleteConfig.stream).toBeDefined();
      expect(chatCompleteConfig.stream.param).toBe('stream');
    });

    test('logit_bias is excluded', () => {
      expect(chatCompleteConfig.logit_bias).toBeUndefined();
    });

    test('logprobs is excluded', () => {
      expect(chatCompleteConfig.logprobs).toBeUndefined();
    });

    test('top_logprobs is excluded', () => {
      expect(chatCompleteConfig.top_logprobs).toBeUndefined();
    });

    test('response_format is included', () => {
      expect(chatCompleteConfig.response_format).toBeDefined();
      expect(chatCompleteConfig.response_format.param).toBe('response_format');
    });
  });

  describe('response transforms', () => {
    test('successful response is transformed correctly', () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1700000000,
        model: 'MiniMax-M2.7',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello! How can I help you?',
            },
            logprobs: null,
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 8,
          total_tokens: 18,
        },
      };

      const result = MiniMaxChatCompleteResponseTransform(
        mockResponse as any,
        200
      );
      expect(result).toHaveProperty('provider', MINIMAX);
      expect(result).toHaveProperty('id', 'chatcmpl-123');
      expect(result).toHaveProperty('model', 'MiniMax-M2.7');
      expect((result as any).choices[0].message.content).toBe(
        'Hello! How can I help you?'
      );
      expect((result as any).usage.total_tokens).toBe(18);
    });

    test('error response is transformed correctly', () => {
      const mockError = {
        error: {
          message: 'Invalid API key',
          type: 'authentication_error',
          code: 401,
        },
      };

      const result = MiniMaxChatCompleteResponseTransform(
        mockError as any,
        401
      );
      expect(result).toHaveProperty('error');
      expect((result as any).error.message).toContain('Invalid API key');
    });

    test('invalid response returns error', () => {
      const mockInvalid = { unexpected: 'data' };

      const result = MiniMaxChatCompleteResponseTransform(
        mockInvalid as any,
        200
      );
      expect(result).toHaveProperty('error');
    });
  });

  describe('stream chunk transform', () => {
    test('transforms regular chunk correctly', () => {
      const chunk = `data: ${JSON.stringify({
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: 1700000000,
        model: 'MiniMax-M2.7',
        choices: [
          {
            index: 0,
            delta: { content: 'Hello' },
            finish_reason: null,
          },
        ],
      })}`;

      const result = MiniMaxChatCompleteStreamChunkTransform(chunk);
      expect(result).toContain('data: ');
      expect(result).toContain('"provider":"minimax"');
      expect(result).toContain('"content":"Hello"');
    });

    test('handles [DONE] sentinel', () => {
      const result = MiniMaxChatCompleteStreamChunkTransform('data: [DONE]');
      expect(result).toBe('data: [DONE]\n\n');
    });

    test('transforms chunk with usage info', () => {
      const chunk = `data: ${JSON.stringify({
        id: 'chatcmpl-123',
        object: 'chat.completion.chunk',
        created: 1700000000,
        model: 'MiniMax-M2.7',
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      })}`;

      const result = MiniMaxChatCompleteStreamChunkTransform(chunk);
      expect(result).toContain('"total_tokens":15');
    });

    test('transforms chunk with tool calls', () => {
      const chunk = `data: ${JSON.stringify({
        id: 'chatcmpl-456',
        object: 'chat.completion.chunk',
        created: 1700000000,
        model: 'MiniMax-M2.7',
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                { id: 'call_1', type: 'function', function: { name: 'test' } },
              ],
            },
            finish_reason: null,
          },
        ],
      })}`;

      const result = MiniMaxChatCompleteStreamChunkTransform(chunk);
      expect(result).toContain('"tool_calls"');
    });

    test('transforms chunk without data: prefix', () => {
      const chunk = JSON.stringify({
        id: 'chatcmpl-789',
        object: 'chat.completion.chunk',
        created: 1700000000,
        model: 'MiniMax-M2.7-highspeed',
        choices: [
          {
            index: 0,
            delta: { content: 'World' },
            finish_reason: null,
          },
        ],
      });

      const result = MiniMaxChatCompleteStreamChunkTransform(chunk);
      expect(result).toContain('"content":"World"');
      expect(result).toContain('"model":"MiniMax-M2.7-highspeed"');
    });
  });
});
