import { FireworksAIChatCompleteStreamChunkTransform } from '../../../../../src/providers/fireworks-ai/chatComplete';

const baseChunk = {
  id: 'test-id',
  object: 'chat.completion.chunk',
  created: 1234567890,
  model: 'accounts/fireworks/models/llama-v3p1-405b-instruct',
};

const sse = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`;

describe('FireworksAIChatCompleteStreamChunkTransform', () => {
  it('transforms a normal chunk with choices', () => {
    const out = FireworksAIChatCompleteStreamChunkTransform(
      sse({
        ...baseChunk,
        choices: [
          {
            index: 0,
            delta: { role: 'assistant', content: 'hello' },
            finish_reason: null,
            logprobs: null,
          },
        ],
      })
    );
    const parsed = JSON.parse(out.replace(/^data: /, ''));
    expect(parsed.provider).toEqual('fireworks-ai');
    expect(parsed.choices).toHaveLength(1);
    expect(parsed.choices[0].delta).toEqual({
      role: 'assistant',
      content: 'hello',
    });
  });

  it('does not throw on empty choices and emits choices: []', () => {
    const out = FireworksAIChatCompleteStreamChunkTransform(
      sse({ ...baseChunk, choices: [] })
    );
    const parsed = JSON.parse(out.replace(/^data: /, ''));
    expect(parsed.choices).toEqual([]);
  });

  it('does not throw when choices is absent (usage-only chunk) and passes usage through', () => {
    const usage = {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    };
    const out = FireworksAIChatCompleteStreamChunkTransform(
      sse({ ...baseChunk, usage })
    );
    const parsed = JSON.parse(out.replace(/^data: /, ''));
    expect(parsed.choices).toEqual([]);
    expect(parsed.usage).toEqual(usage);
  });

  it('passes [DONE] through unchanged', () => {
    expect(FireworksAIChatCompleteStreamChunkTransform('data: [DONE]')).toEqual(
      'data: [DONE]\n\n'
    );
  });
});
