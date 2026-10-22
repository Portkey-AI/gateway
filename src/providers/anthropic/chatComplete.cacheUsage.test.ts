import { getAnthropicChatCompleteResponseTransform } from './chatComplete';

const transform = getAnthropicChatCompleteResponseTransform('anthropic');

describe('Anthropic OpenAI-format usage cache folding (#1834)', () => {
  it('makes prompt_tokens cache-inclusive', () => {
    const response = transform(
      {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-6',
        content: [{ type: 'text', text: 'hi' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 7,
          output_tokens: 5,
          cache_read_input_tokens: 10427,
          cache_creation_input_tokens: 0,
        },
      } as any,
      200,
      new Headers(),
      true
    ) as any;

    expect(response.usage.prompt_tokens).toBe(7 + 10427);
    expect(response.usage.completion_tokens).toBe(5);
    expect(response.usage.total_tokens).toBe(7 + 5 + 10427);
    expect(response.usage.prompt_tokens_details.cached_tokens).toBe(10427);
    // OpenAI consumers: uncached = prompt_tokens - cached_tokens
    expect(
      response.usage.prompt_tokens - response.usage.prompt_tokens_details.cached_tokens
    ).toBe(7);
  });

  it('includes cache_creation_input_tokens in prompt_tokens', () => {
    const response = transform(
      {
        id: 'msg_2',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-6',
        content: [{ type: 'text', text: 'hi' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 7,
          output_tokens: 5,
          cache_creation_input_tokens: 10427,
          cache_read_input_tokens: 0,
        },
      } as any,
      200,
      new Headers(),
      true
    ) as any;

    expect(response.usage.prompt_tokens).toBe(7 + 10427);
    expect(response.usage.total_tokens).toBe(7 + 5 + 10427);
  });
});
