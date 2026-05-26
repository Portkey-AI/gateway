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

  // Helper: split a concatenated SSE payload into individual event JSON objects.
  const splitSse = (payload: string): { events: any[]; hasDone: boolean } => {
    const events: any[] = [];
    let hasDone = false;
    for (const block of payload.split('\n\n')) {
      const trimmed = block.trim();
      if (!trimmed.startsWith('data:')) continue;
      const body = trimmed.slice('data:'.length).trim();
      if (body === '[DONE]') {
        hasDone = true;
        continue;
      }
      events.push(JSON.parse(body));
    }
    return { events, hasDone };
  };

  it('emits a tool_calls delta SSE then finish then [DONE] (bundled-finish chunk)', () => {
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
    ) as string;

    const { events, hasDone } = splitSse(out);
    expect(events.length).toBe(2);
    expect(events[0].choices[0].delta.tool_calls[0].id).toBe('call_xyz');
    expect(events[0].choices[0].delta.tool_calls[0].function.name).toBe(
      'get_weather'
    );
    expect(events[1].choices[0].finish_reason).toBe('tool_calls');
    expect(hasDone).toBe(true);
  });

  it('assigns stable indices when OCI bundles multiple tool calls', () => {
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
    ) as string;

    const { events } = splitSse(out);
    const calls = events[0].choices[0].delta.tool_calls;
    expect(calls.map((c: any) => c.index)).toEqual([0, 1]);
    expect(calls.map((c: any) => c.id)).toEqual(['call_a', 'call_b']);
  });

  it('keeps continuation chunks attached to the same tool index when id is omitted', () => {
    const state = initOracleStreamState();

    const first = OracleChatCompleteStreamChunkTransform(
      'data: ' +
        JSON.stringify({
          index: 0,
          message: {
            role: 'ASSISTANT',
            content: [],
            toolCalls: [
              { id: 'call_progressive', name: 'get_weather', arguments: '' },
            ],
          },
        }),
      'fallback-id',
      state,
      false,
      params
    ) as string;

    const second = OracleChatCompleteStreamChunkTransform(
      'data: ' +
        JSON.stringify({
          index: 0,
          message: {
            role: 'ASSISTANT',
            content: [],
            toolCalls: [{ arguments: '{"city":"' }],
          },
        }),
      'fallback-id',
      state,
      false,
      params
    ) as string;

    const firstEvent = JSON.parse(first.split('\n\n')[0].slice('data:'.length));
    const secondEvent = JSON.parse(
      second.split('\n\n')[0].slice('data:'.length)
    );
    expect(firstEvent.choices[0].delta.tool_calls[0].index).toBe(0);
    expect(secondEvent.choices[0].delta.tool_calls[0].index).toBe(0);
    expect(secondEvent.choices[0].delta.tool_calls[0].id).toBeUndefined();
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
