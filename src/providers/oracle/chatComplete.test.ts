import {
  initOracleStreamState,
  OracleChatCompleteResponseTransform,
  OracleChatCompleteStreamChunkTransform,
  OracleChatDetailsConfig,
} from './chatComplete';
import { Message } from './types/ChatDetails';

const baseProviderOptions = {
  oracleCompartmentId: 'ocid1.compartment.oc1..test',
} as any;

const transformMessages = (messages: any[]): Message[] => {
  const config = OracleChatDetailsConfig.messages as any;
  return config.transform({ messages }, baseProviderOptions);
};

describe('Oracle Chat Complete — tool calls in request transform', () => {
  it('attaches toolCalls to assistant messages', () => {
    const out = transformMessages([
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"NYC"}' },
          },
        ],
      },
    ]);

    expect(out[0].toolCalls).toEqual([
      {
        id: 'call_1',
        type: 'FUNCTION',
        name: 'get_weather',
        arguments: '{"city":"NYC"}',
      },
    ]);
  });

  it('attaches toolCallId to tool messages', () => {
    const out = transformMessages([
      {
        role: 'tool',
        tool_call_id: 'call_1',
        content: '{"temp":72}',
      },
    ]);

    expect(out[0].toolCallId).toBe('call_1');
    expect(out[0].role).toBe('TOOL');
  });

  it('does not attach toolCallId to non-tool messages', () => {
    const out = transformMessages([{ role: 'user', content: 'hi' }]);
    expect(out[0].toolCallId).toBeUndefined();
  });
});

describe('Oracle Chat Complete — non-streaming response with tool_calls', () => {
  it('extracts tool_calls into OpenAI shape', () => {
    const response: any = {
      modelId: 'meta.llama-3.3-70b-instruct',
      chatResponse: {
        timeCreated: '2026-01-01T00:00:00Z',
        choices: [
          {
            index: 0,
            finishReason: 'tool_calls',
            message: {
              role: 'ASSISTANT',
              content: [],
              toolCalls: [
                {
                  id: 'call_abc',
                  name: 'get_weather',
                  arguments: '{"city":"NYC"}',
                },
              ],
            },
          },
        ],
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
      },
    };

    const result: any = OracleChatCompleteResponseTransform(
      response,
      200,
      new Headers()
    );

    expect(result.choices[0].message.tool_calls).toEqual([
      {
        id: 'call_abc',
        type: 'function',
        function: { name: 'get_weather', arguments: '{"city":"NYC"}' },
      },
    ]);
    expect(result.choices[0].finish_reason).toBe('tool_calls');
  });

  it('synthesises an id when the provider omits it', () => {
    const response: any = {
      modelId: 'google.gemini-2.5-flash',
      chatResponse: {
        timeCreated: '2026-01-01T00:00:00Z',
        choices: [
          {
            index: 0,
            finishReason: 'tool_calls',
            message: {
              role: 'ASSISTANT',
              content: [],
              toolCalls: [{ name: 'get_weather', arguments: '{}' }],
            },
          },
        ],
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      },
    };

    const result: any = OracleChatCompleteResponseTransform(
      response,
      200,
      new Headers()
    );

    expect(result.choices[0].message.tool_calls[0].id).toMatch(/^call_/);
  });
});

describe('Oracle Chat Complete — streaming chunk transform tool calls', () => {
  const params: any = { model: 'meta.llama-3.3-70b-instruct' };

  it('emits tool_calls delta separately from the finish chunk', () => {
    const state = initOracleStreamState();

    const sseChunk =
      'data: ' +
      JSON.stringify({
        index: 0,
        finishReason: 'tool_calls',
        message: {
          role: 'ASSISTANT',
          content: [],
          toolCalls: [
            {
              id: 'call_xyz',
              name: 'get_weather',
              arguments: '{"city":"NYC"}',
            },
          ],
        },
      });

    const out = OracleChatCompleteStreamChunkTransform(
      sseChunk,
      'fallback-id',
      state,
      false,
      params
    );

    expect(Array.isArray(out)).toBe(true);
    const arr = out as string[];
    // Expect: [tool_calls delta, finish chunk, [DONE]]
    expect(arr.length).toBe(3);
    expect(arr[0]).toContain('"tool_calls"');
    expect(arr[0]).toContain('"call_xyz"');
    expect(arr[1]).toContain('"finish_reason":"tool_calls"');
    expect(arr[2]).toBe('data: [DONE]\n\n');
  });

  it('preserves stable indices across multiple tool calls', () => {
    const state = initOracleStreamState();

    const sseChunk =
      'data: ' +
      JSON.stringify({
        index: 0,
        finishReason: 'tool_calls',
        message: {
          role: 'ASSISTANT',
          content: [],
          toolCalls: [
            { id: 'call_a', name: 'fn_a', arguments: '{}' },
            { id: 'call_b', name: 'fn_b', arguments: '{}' },
          ],
        },
      });

    const out = OracleChatCompleteStreamChunkTransform(
      sseChunk,
      'fallback-id',
      state,
      false,
      params
    ) as string[];

    const toolDelta = JSON.parse(out[0].replace(/^data: /, ''));
    const calls = toolDelta.choices[0].delta.tool_calls;
    expect(calls.map((c: any) => c.index)).toEqual([0, 1]);
    expect(calls.map((c: any) => c.id)).toEqual(['call_a', 'call_b']);
  });

  it('returns DONE marker for [DONE] line', () => {
    const out = OracleChatCompleteStreamChunkTransform(
      'data: [DONE]',
      'fallback-id',
      initOracleStreamState(),
      false,
      params
    );
    expect(out).toBe('data: [DONE]\n\n');
  });

  it('skips ping events', () => {
    const out = OracleChatCompleteStreamChunkTransform(
      'event: ping',
      'fallback-id',
      initOracleStreamState(),
      false,
      params
    );
    expect(out).toBeUndefined();
  });
});
