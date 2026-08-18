import { TritonEmbedResponseTransform } from './embed';

describe('TritonEmbedResponseTransform', () => {
  it('maps a Triton OpenAI-compatible embeddings response to the gateway shape', () => {
    const upstream = {
      object: 'list',
      data: [
        { object: 'embedding', index: 0, embedding: [0.1, 0.2, 0.3] },
        { object: 'embedding', index: 1, embedding: [0.4, 0.5, 0.6] },
      ],
      model: 'BAAI/bge-large-en-v1.5',
      usage: { prompt_tokens: 8, total_tokens: 8 },
    };

    const result = TritonEmbedResponseTransform(upstream, 200);

    expect('data' in result).toBe(true);
    if ('data' in result) {
      expect(result.object).toBe('list');
      expect(result.model).toBe('BAAI/bge-large-en-v1.5');
      expect(result.data).toHaveLength(2);
      expect(result.data[1].embedding).toEqual([0.4, 0.5, 0.6]);
      expect(result.usage.total_tokens).toBe(8);
    }
    expect((result as { provider: string }).provider).toBe('triton');
  });

  it('surfaces a Triton error body as a gateway error response', () => {
    const result = TritonEmbedResponseTransform(
      { error: 'model bge is not ready' },
      400
    );

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.message).toBe('triton error: model bge is not ready');
      expect(result.provider).toBe('triton');
    }
  });
});
