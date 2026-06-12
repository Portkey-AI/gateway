import { GoogleChatCompleteStreamChunkTransform } from './chatComplete';

describe('GoogleChatCompleteStreamChunkTransform', () => {
  // Gemini emits a terminating stream chunk whose candidate carries a
  // `finishReason` and a `content` object that has NO `parts` array
  // (e.g. finishReason "SAFETY" / "RECITATION"). The transform must not crash.
  it('does not throw when candidate content has no parts array', () => {
    const chunk =
      'data: ' +
      JSON.stringify({
        candidates: [
          { content: { role: 'model' }, finishReason: 'SAFETY', index: 0 },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 0,
          totalTokenCount: 10,
        },
        modelVersion: 'gemini-1.5-pro',
      });

    const streamState: any = {};
    let output: string = '';
    expect(() => {
      output = GoogleChatCompleteStreamChunkTransform(
        chunk,
        'fb-id',
        streamState,
        false
      );
    }).not.toThrow();

    const json = JSON.parse(output.replace(/^data: /, '').trim());
    expect(json.choices[0].finish_reason).toBe('SAFETY');
    expect(json.choices[0].delta.content).toBe('');
  });
});
