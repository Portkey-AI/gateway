import { Context } from 'hono';
import BF16APIConfig from './api';
import {
  BF16ChatCompleteConfig,
  BF16ChatCompleteStreamChunkTransform,
} from './chatComplete';
import { BF16, VALID_PROVIDERS } from '../../globals';

describe('BF16 Provider', () => {
  const mockContext = {} as Context;

  test('registers bf16 constant in VALID_PROVIDERS', () => {
    expect(BF16).toBe('bf16');
    expect(VALID_PROVIDERS).toContain('bf16');
  });

  test('api config returns expected baseURL, auth header, and endpoints', () => {
    const baseURL = BF16APIConfig.getBaseURL({
      providerOptions: { provider: 'bf16' },
      c: mockContext,
      gatewayRequestURL: 'http://localhost:8787/v1/chat/completions',
    });
    expect(baseURL).toBe('https://api.bf16.ai/v1');

    const headers = BF16APIConfig.headers({
      c: mockContext,
      providerOptions: { provider: 'bf16', apiKey: 'test-key' },
      fn: 'chatComplete',
      transformedRequestBody: {},
      transformedRequestUrl: 'https://api.bf16.ai/v1/chat/completions',
    });
    expect(headers).toEqual({ Authorization: 'Bearer test-key' });

    const chatEndpoint = BF16APIConfig.getEndpoint({
      c: mockContext,
      providerOptions: { provider: 'bf16' },
      fn: 'chatComplete',
      gatewayRequestBodyJSON: {},
      gatewayRequestURL: 'http://localhost:8787/v1/chat/completions',
    });
    expect(chatEndpoint).toBe('/chat/completions');

    const unsupportedEndpoint = BF16APIConfig.getEndpoint({
      c: mockContext,
      providerOptions: { provider: 'bf16' },
      fn: 'complete',
      gatewayRequestBodyJSON: {},
      gatewayRequestURL: 'http://localhost:8787/v1/completions',
    });
    expect(unsupportedEndpoint).toBe('');
  });

  test('chatComplete sets default bf16 model', () => {
    const modelParam = BF16ChatCompleteConfig.model as { default?: string };
    expect(modelParam?.default).toBe('deepseek/deepseek-v4.1-flash-uncensored');
  });

  test('stream-chatComplete handles [DONE], empty lines, rich deltas, and invalid JSON', () => {
    expect(BF16ChatCompleteStreamChunkTransform('')).toBe('');
    expect(BF16ChatCompleteStreamChunkTransform('data:   ')).toBe('');
    expect(BF16ChatCompleteStreamChunkTransform('data: [DONE]')).toBe(
      'data: [DONE]\n\n'
    );

    const sseLine =
      'data: ' +
      JSON.stringify({
        id: 'chatcmpl-stream-1',
        object: 'chat.completion.chunk',
        created: 1794637463,
        model: 'deepseek/deepseek-v4.1-flash-uncensored',
        choices: [
          {
            index: 0,
            delta: {
              reasoning_content: 'thinking',
              content: 'hello',
              tool_calls: [{ index: 0, id: 'call_1' }],
            },
            finish_reason: null,
          },
        ],
      });

    const parsed = JSON.parse(
      BF16ChatCompleteStreamChunkTransform(sseLine).replace(/^data:\s*/, '')
    );
    expect(parsed.provider).toBe('bf16');
    expect(parsed.choices[0].delta.reasoning_content).toBe('thinking');
    expect(parsed.choices[0].delta.tool_calls).toEqual([
      { index: 0, id: 'call_1' },
    ]);

    expect(BF16ChatCompleteStreamChunkTransform('data: {bad-json')).toBe(
      'data: {bad-json\n\n'
    );
  });
});
