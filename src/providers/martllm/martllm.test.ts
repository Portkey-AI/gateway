import { MARTLLM, VALID_PROVIDERS } from '../../globals';
import MartLLMAPIConfig from './api';
import { MartLLMChatCompleteStreamChunkTransform } from './chatComplete';

describe('MartLLM provider', () => {
  it('is a valid provider', () => {
    expect(VALID_PROVIDERS).toContain(MARTLLM);
  });

  it('builds the request target and auth header', () => {
    const args = { providerOptions: { apiKey: 'test-key' } } as any;
    expect(MartLLMAPIConfig.getBaseURL(args)).toBe(
      'https://api.martllm.com/v1'
    );
    expect(MartLLMAPIConfig.headers(args)).toEqual({
      Authorization: 'Bearer test-key',
    });
    expect(MartLLMAPIConfig.getEndpoint({ ...args, fn: 'chatComplete' })).toBe(
      '/chat/completions'
    );
  });

  it('adds the provider to stream chunks and keeps every other field', () => {
    const chunk = {
      id: 'chatcmpl-1',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'deepseek/deepseek-v4.1-flash',
      choices: [
        {
          index: 0,
          delta: { content: 'Hi', reasoning_content: 'thinking' },
          finish_reason: null,
        },
      ],
    };
    const out = MartLLMChatCompleteStreamChunkTransform(
      `data: ${JSON.stringify(chunk)}`
    );
    expect(JSON.parse(out.replace(/^data: /, ''))).toEqual({
      ...chunk,
      provider: MARTLLM,
    });
  });

  it('passes [DONE] through', () => {
    expect(MartLLMChatCompleteStreamChunkTransform('data: [DONE]')).toBe(
      'data: [DONE]\n\n'
    );
  });
});
