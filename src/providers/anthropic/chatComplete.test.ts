import { getAnthropicChatCompleteResponseTransform } from './chatComplete';

const transform = getAnthropicChatCompleteResponseTransform('anthropic');

const buildResponse = (usage: {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}) => ({
  id: 'msg_123',
  type: 'message',
  role: 'assistant',
  model: 'claude-3-5-sonnet',
  stop_reason: 'end_turn',
  stop_sequence: null,
  content: [{ type: 'text', text: 'hello' }],
  usage,
});

const usageOf = (response: any) => {
  const result: any = transform(response as any, 200, new Headers(), false);
  return result.usage;
};

describe('AnthropicChatCompleteResponseTransform usage', () => {
  test('folds cache_read tokens into prompt_tokens', () => {
    const usage = usageOf(
      buildResponse({
        input_tokens: 10,
        output_tokens: 40,
        cache_read_input_tokens: 5000,
      })
    );

    expect(usage.prompt_tokens).toBe(5010);
    expect(usage.completion_tokens).toBe(40);
    expect(usage.total_tokens).toBe(5050);
    expect(usage.prompt_tokens_details.cached_tokens).toBe(5000);
    // total_tokens must equal prompt_tokens + completion_tokens
    expect(usage.total_tokens).toBe(
      usage.prompt_tokens + usage.completion_tokens
    );
  });

  test('folds cache_creation tokens into prompt_tokens', () => {
    const usage = usageOf(
      buildResponse({
        input_tokens: 10,
        output_tokens: 40,
        cache_creation_input_tokens: 200,
      })
    );

    expect(usage.prompt_tokens).toBe(210);
    expect(usage.total_tokens).toBe(250);
    expect(usage.total_tokens).toBe(
      usage.prompt_tokens + usage.completion_tokens
    );
  });

  test('cached_tokens never exceeds prompt_tokens', () => {
    const usage = usageOf(
      buildResponse({
        input_tokens: 10,
        output_tokens: 40,
        cache_read_input_tokens: 5000,
        cache_creation_input_tokens: 100,
      })
    );

    expect(usage.prompt_tokens_details.cached_tokens).toBeLessThanOrEqual(
      usage.prompt_tokens
    );
  });

  test('uncached request is unaffected', () => {
    const usage = usageOf(
      buildResponse({ input_tokens: 100, output_tokens: 40 })
    );

    expect(usage.prompt_tokens).toBe(100);
    expect(usage.completion_tokens).toBe(40);
    expect(usage.total_tokens).toBe(140);
    expect(usage.prompt_tokens_details.cached_tokens).toBe(0);
  });
});
