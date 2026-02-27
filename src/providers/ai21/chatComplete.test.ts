import { AI21ChatCompleteStreamChunkTransform } from './chatComplete';

describe('AI21ChatCompleteStreamChunkTransform', () => {
  const fallbackId = 'ai21-fallback-id';
  const streamState = {};

  it('should transform a role-only first chunk', () => {
    const rawChunk = `data: ${JSON.stringify({
      id: 'req-123',
      object: 'chat.completion.chunk',
      created: 1700000000,
      model: 'jamba-1.5-mini',
      choices: [
        { index: 0, delta: { role: 'assistant' }, finish_reason: null },
      ],
      usage: null,
    })}`;

    const result = AI21ChatCompleteStreamChunkTransform(
      rawChunk,
      fallbackId,
      streamState,
      true
    );

    const parsed = JSON.parse(result.replace('data: ', '').trim());
    expect(parsed.id).toBe('req-123');
    expect(parsed.object).toBe('chat.completion.chunk');
    expect(parsed.model).toBe('jamba-1.5-mini');
    expect(parsed.provider).toBe('ai21');
    expect(parsed.choices[0].delta.role).toBe('assistant');
    expect(parsed.choices[0].finish_reason).toBeNull();
    expect(parsed.usage).toBeNull();
  });

  it('should transform a content delta chunk', () => {
    const rawChunk = `data: ${JSON.stringify({
      id: 'req-123',
      object: 'chat.completion.chunk',
      created: 1700000000,
      model: 'jamba-1.5-mini',
      choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }],
      usage: null,
    })}`;

    const result = AI21ChatCompleteStreamChunkTransform(
      rawChunk,
      fallbackId,
      streamState,
      true
    );

    const parsed = JSON.parse(result.replace('data: ', '').trim());
    expect(parsed.choices[0].delta.content).toBe('Hello');
    expect(parsed.choices[0].finish_reason).toBeNull();
  });

  it('should transform a final chunk with finish_reason and usage', () => {
    const rawChunk = `data: ${JSON.stringify({
      id: 'req-123',
      object: 'chat.completion.chunk',
      created: 1700000000,
      model: 'jamba-1.5-mini',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 45,
        total_tokens: 55,
      },
    })}`;

    const result = AI21ChatCompleteStreamChunkTransform(
      rawChunk,
      fallbackId,
      streamState,
      true
    );

    const parsed = JSON.parse(result.replace('data: ', '').trim());
    expect(parsed.choices[0].finish_reason).toBe('stop');
    expect(parsed.usage).toEqual({
      prompt_tokens: 10,
      completion_tokens: 45,
      total_tokens: 55,
    });
  });

  it('should handle [DONE] marker', () => {
    const rawChunk = 'data: [DONE]';

    const result = AI21ChatCompleteStreamChunkTransform(
      rawChunk,
      fallbackId,
      streamState,
      true
    );

    expect(result).toBe('data: [DONE]\n\n');
  });

  it('should use fallbackId when chunk has no id', () => {
    const rawChunk = `data: ${JSON.stringify({
      object: 'chat.completion.chunk',
      created: 1700000000,
      model: 'jamba-1.5-mini',
      choices: [{ index: 0, delta: { content: 'test' }, finish_reason: null }],
    })}`;

    const result = AI21ChatCompleteStreamChunkTransform(
      rawChunk,
      fallbackId,
      streamState,
      true
    );

    const parsed = JSON.parse(result.replace('data: ', '').trim());
    expect(parsed.id).toBe(fallbackId);
  });

  it('should handle chunk without data: prefix', () => {
    const rawChunk = JSON.stringify({
      id: 'req-456',
      object: 'chat.completion.chunk',
      created: 1700000000,
      model: 'jamba-1.5-mini',
      choices: [{ index: 0, delta: { content: 'world' }, finish_reason: null }],
      usage: null,
    });

    const result = AI21ChatCompleteStreamChunkTransform(
      rawChunk,
      fallbackId,
      streamState,
      true
    );

    const parsed = JSON.parse(result.replace('data: ', '').trim());
    expect(parsed.id).toBe('req-456');
    expect(parsed.choices[0].delta.content).toBe('world');
  });

  it('should output in SSE format with trailing newlines', () => {
    const rawChunk = `data: ${JSON.stringify({
      id: 'req-123',
      object: 'chat.completion.chunk',
      created: 1700000000,
      model: 'jamba-1.5-mini',
      choices: [{ index: 0, delta: { content: 'hi' }, finish_reason: null }],
      usage: null,
    })}`;

    const result = AI21ChatCompleteStreamChunkTransform(
      rawChunk,
      fallbackId,
      streamState,
      true
    );

    expect(result).toMatch(/^data: \{.*\}\n\n$/);
  });

  it('should transform length finish_reason with strict compliance', () => {
    const rawChunk = `data: ${JSON.stringify({
      id: 'req-123',
      object: 'chat.completion.chunk',
      created: 1700000000,
      model: 'jamba-1.5-mini',
      choices: [{ index: 0, delta: {}, finish_reason: 'length' }],
      usage: null,
    })}`;

    const result = AI21ChatCompleteStreamChunkTransform(
      rawChunk,
      fallbackId,
      streamState,
      true
    );

    const parsed = JSON.parse(result.replace('data: ', '').trim());
    expect(parsed.choices[0].finish_reason).toBe('length');
  });
});
