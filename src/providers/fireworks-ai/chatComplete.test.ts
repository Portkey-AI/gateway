import { FireworksAIChatCompleteStreamChunkTransform } from './chatComplete';

describe('FireworksAIChatCompleteStreamChunkTransform', () => {
  it('handles usage-only stream chunks with empty choices', () => {
    const chunk = {
      id: 'chatcmpl-123',
      object: 'chat.completion.chunk',
      created: 1710000000,
      model: 'accounts/fireworks/models/llama-v3',
      choices: [],
      usage: {
        prompt_tokens: 1,
        completion_tokens: 2,
        total_tokens: 3,
      },
    };

    const transformed = FireworksAIChatCompleteStreamChunkTransform(
      `data: ${JSON.stringify(chunk)}\n\n`
    );

    expect(transformed).toBe(
      `data: ${JSON.stringify({
        id: chunk.id,
        object: chunk.object,
        created: chunk.created,
        model: chunk.model,
        provider: 'fireworks-ai',
        choices: [],
        usage: chunk.usage,
      })}\n\n`
    );
  });
});
