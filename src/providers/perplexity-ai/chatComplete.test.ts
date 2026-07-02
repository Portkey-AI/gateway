import { PerplexityAIChatCompleteStreamChunkTransform } from './chatComplete';

describe('PerplexityAIChatCompleteStreamChunkTransform', () => {
  it('passes through the [DONE] sentinel without throwing', () => {
    expect(() =>
      PerplexityAIChatCompleteStreamChunkTransform(
        'data: [DONE]',
        'fallback-id',
        {},
        false
      )
    ).not.toThrow();

    const out = PerplexityAIChatCompleteStreamChunkTransform(
      'data: [DONE]',
      'fallback-id',
      {},
      false
    );
    expect(out).toBe('data: [DONE]\n\n');
  });

  it('transforms a normal content chunk', () => {
    const upstream = JSON.stringify({
      id: 'abc',
      object: 'chat.completion.chunk',
      model: 'sonar',
      choices: [
        { delta: { role: 'assistant', content: 'Hi' }, finish_reason: null },
      ],
    });

    const out = PerplexityAIChatCompleteStreamChunkTransform(
      `data: ${upstream}`,
      'fallback-id',
      {},
      false
    );

    expect(out.startsWith('data: ')).toBe(true);
    const parsed = JSON.parse(out.replace(/^data: /, '').trim());
    expect(parsed.choices[0].delta.content).toBe('Hi');
  });
});
