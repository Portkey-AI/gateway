import { GoogleChatCompleteStreamChunkTransform } from './chatComplete';

describe('GoogleChatCompleteStreamChunkTransform', () => {
  const chunkObject = {
    modelVersion: 'gemini-1.5-flash',
    candidates: [
      {
        content: { role: 'model', parts: [{ text: 'Hello' }] },
        finishReason: 'STOP',
        index: 0,
      },
    ],
    usageMetadata: {
      promptTokenCount: 5,
      candidatesTokenCount: 1,
      totalTokenCount: 6,
    },
  };

  it('parses the terminal chunk of a streamed JSON array (trailing "]")', () => {
    // Google (AI Studio) streams a JSON array; the final element arrives as
    // `{...}]`. Only the `]` should be stripped, not the closing `}`.
    const terminalChunk = `${JSON.stringify(chunkObject)}]`;

    let out = '';
    expect(() => {
      out = GoogleChatCompleteStreamChunkTransform(
        terminalChunk,
        'fallback-id',
        {},
        false
      );
    }).not.toThrow();

    // Before the fix, `}` was also stripped and JSON.parse threw on the
    // final chunk (the one carrying finishReason / usageMetadata).
    const parsed = JSON.parse(out.replace(/^data: /, '').trim());
    expect(parsed.choices[0].delta.content).toBe('Hello');
    expect(parsed.choices[0].finish_reason).toBeTruthy();
    expect(parsed.usage.total_tokens).toBe(6);
  });

  it('still handles a middle chunk with a trailing comma', () => {
    const middleChunk = `${JSON.stringify(chunkObject)},`;
    expect(() =>
      GoogleChatCompleteStreamChunkTransform(
        middleChunk,
        'fallback-id',
        {},
        false
      )
    ).not.toThrow();
  });
});
