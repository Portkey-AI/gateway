import { FireworksAIChatCompleteStreamChunkTransform } from './chatComplete';

describe('FireworksAIChatCompleteStreamChunkTransform', () => {
  it('transforms a normal stream chunk with choices', () => {
    const input = JSON.stringify({
      id: 'chatcmpl-123',
      object: 'chat.completion.chunk',
      created: 1700000000,
      model: 'accounts/fireworks/models/llama-v3p1-405b-instruct',
      choices: [
        {
          index: 0,
          delta: { role: 'assistant', content: 'Hello' },
          finish_reason: null,
          logprobs: null,
        },
      ],
      usage: null,
    });

    const result = FireworksAIChatCompleteStreamChunkTransform(
      `data: ${input}`
    );
    const parsed = JSON.parse(result.replace('data: ', '').trim());

    expect(parsed.id).toBe('chatcmpl-123');
    expect(parsed.provider).toBe('fireworks-ai');
    expect(parsed.choices).toHaveLength(1);
    expect(parsed.choices[0].delta.content).toBe('Hello');
    expect(parsed.choices[0].finish_reason).toBeNull();
  });

  it('handles empty choices array without crashing', () => {
    const input = JSON.stringify({
      id: 'chatcmpl-123',
      object: 'chat.completion.chunk',
      created: 1700000000,
      model: 'accounts/fireworks/models/llama-v3p1-405b-instruct',
      choices: [],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    });

    const result = FireworksAIChatCompleteStreamChunkTransform(
      `data: ${input}`
    );
    const parsed = JSON.parse(result.replace('data: ', '').trim());

    expect(parsed.id).toBe('chatcmpl-123');
    expect(parsed.provider).toBe('fireworks-ai');
    expect(parsed.choices).toEqual([]);
    expect(parsed.usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    });
  });

  it('handles [DONE] chunk', () => {
    const result = FireworksAIChatCompleteStreamChunkTransform('data: [DONE]');
    expect(result).toBe('data: [DONE]\n\n');
  });

  it('includes usage when present in chunk with choices', () => {
    const input = JSON.stringify({
      id: 'chatcmpl-456',
      object: 'chat.completion.chunk',
      created: 1700000000,
      model: 'accounts/fireworks/models/llama-v3p1-405b-instruct',
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: 'stop',
          logprobs: null,
        },
      ],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 10,
        total_tokens: 30,
      },
    });

    const result = FireworksAIChatCompleteStreamChunkTransform(
      `data: ${input}`
    );
    const parsed = JSON.parse(result.replace('data: ', '').trim());

    expect(parsed.usage).toEqual({
      prompt_tokens: 20,
      completion_tokens: 10,
      total_tokens: 30,
    });
    expect(parsed.choices[0].finish_reason).toBe('stop');
  });

  it('omits usage when null', () => {
    const input = JSON.stringify({
      id: 'chatcmpl-789',
      object: 'chat.completion.chunk',
      created: 1700000000,
      model: 'accounts/fireworks/models/llama-v3p1-405b-instruct',
      choices: [
        {
          index: 0,
          delta: { content: 'Hi' },
          finish_reason: null,
          logprobs: null,
        },
      ],
      usage: null,
    });

    const result = FireworksAIChatCompleteStreamChunkTransform(
      `data: ${input}`
    );
    const parsed = JSON.parse(result.replace('data: ', '').trim());

    expect(parsed.usage).toBeUndefined();
  });
});
