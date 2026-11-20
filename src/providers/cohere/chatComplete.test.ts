import { CohereChatCompleteStreamChunkTransform } from './chatComplete';
import { CohereStreamState } from './types';

describe('CohereChatCompleteStreamChunkTransform', () => {
  const transform = (event: object, state: CohereStreamState) => {
    const result = CohereChatCompleteStreamChunkTransform(
      `data: ${JSON.stringify(event)}`,
      'fallback-id',
      state,
      true,
      { model: 'command-a-03-2025' }
    );
    return JSON.parse(result.split('\n\n')[0].replace(/^data: /, ''));
  };

  it('maps multiple streamed tool calls to indexed arrays within one choice', () => {
    const state = { generation_id: 'message-id', lastIndex: 0 };

    for (const index of [0, 1]) {
      const toolCall = {
        id: `call-${index}`,
        type: 'function',
        function: { name: 'get_weather', arguments: '' },
      };
      const start = transform(
        {
          type: 'tool-call-start',
          index,
          delta: { message: { tool_calls: toolCall } },
        },
        state
      );
      expect(start.choices).toEqual([
        {
          index: 0,
          delta: {
            role: 'assistant',
            content: '',
            tool_calls: [{ index, ...toolCall }],
          },
          logprobs: null,
          finish_reason: null,
        },
      ]);

      const delta = transform(
        {
          type: 'tool-call-delta',
          index,
          delta: {
            message: {
              tool_calls: { function: { arguments: '{"city":"Paris"}' } },
            },
          },
        },
        state
      );
      expect(delta.choices[0].index).toBe(0);
      expect(delta.choices[0].delta.tool_calls).toEqual([
        { index, function: { arguments: '{"city":"Paris"}' } },
      ]);
    }

    const end = transform(
      { type: 'message-end', delta: { finish_reason: 'TOOL_CALL' } },
      state
    );
    expect(end.choices[0]).toMatchObject({
      index: 0,
      delta: {},
      finish_reason: 'tool_calls',
    });
  });

  it.each(['Hello', ''])(
    'preserves text %j without adding tool calls',
    (text) => {
      const chunk = transform(
        {
          type: 'content-delta',
          index: 0,
          delta: { message: { content: { text } } },
        },
        { generation_id: 'message-id', lastIndex: 0 }
      );
      expect(chunk.choices[0].delta).toEqual({
        role: 'assistant',
        content: text,
      });
    }
  );

  it('rejects malformed JSON', () => {
    expect(() =>
      CohereChatCompleteStreamChunkTransform(
        'data: {',
        'fallback-id',
        { generation_id: 'message-id', lastIndex: 0 },
        true,
        { model: 'command-a-03-2025' }
      )
    ).toThrow(SyntaxError);
  });
});
