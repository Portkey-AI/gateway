/**
 * Messages API Adapter Tests
 *
 * Uses parameterized tests and shared fixtures for DRY testing.
 */

import { transformMessagesToChatCompletions } from '../messages/requestTransform';
import { transformChatCompletionsToMessages } from '../messages/responseTransform';
import {
  transformStreamChunk,
  createStreamState,
} from '../messages/streamTransform';
import { supportsMessagesApiNatively } from '../messages';

// ============================================================================
// Test Fixtures Factory
// ============================================================================

const fixtures = {
  // Messages API request fixtures
  requests: {
    simple: () => ({
      model: 'gpt-4',
      messages: [{ role: 'user' as const, content: 'Hello' }],
      max_tokens: 100,
    }),

    withSystem: () => ({
      model: 'gpt-4',
      system: 'You are helpful.',
      messages: [{ role: 'user' as const, content: 'Hi' }],
      max_tokens: 100,
    }),

    withSystemArray: () => ({
      model: 'gpt-4',
      system: [
        { type: 'text', text: 'You are helpful.' },
        { type: 'text', text: 'Be concise.' },
      ],
      messages: [{ role: 'user' as const, content: 'Hi' }],
      max_tokens: 100,
    }),

    withTools: () => ({
      model: 'gpt-4',
      messages: [{ role: 'user' as const, content: 'Weather in Paris?' }],
      max_tokens: 100,
      tools: [
        {
          name: 'get_weather',
          description: 'Get weather',
          input_schema: {
            type: 'object',
            properties: { location: { type: 'string' } },
          },
        },
      ],
      tool_choice: { type: 'auto' },
    }),

    withToolUse: () => ({
      model: 'gpt-4',
      messages: [
        { role: 'user' as const, content: 'Weather?' },
        {
          role: 'assistant' as const,
          content: [
            {
              type: 'tool_use',
              id: 'toolu_123',
              name: 'get_weather',
              input: { location: 'Paris' },
            },
          ],
        },
        {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_123',
              content: '22°C, sunny',
            },
          ],
        },
      ],
      max_tokens: 100,
    }),

    multimodal: () => ({
      model: 'gpt-4-vision',
      messages: [
        {
          role: 'user' as const,
          content: [
            { type: 'text', text: 'What is this?' },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: 'abc123',
              },
            },
          ],
        },
      ],
      max_tokens: 100,
    }),

    allParams: () => ({
      model: 'gpt-4',
      messages: [{ role: 'user' as const, content: 'Hi' }],
      max_tokens: 500,
      temperature: 0.7,
      top_p: 0.9,
      stream: true,
      stop_sequences: ['END'],
      metadata: { user_id: 'user_123' },
    }),
  },

  // Chat Completions response fixtures
  responses: {
    simple: () => ({
      id: 'chatcmpl-123',
      object: 'chat.completion',
      created: 1700000000,
      model: 'gpt-4',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello! How can I help?' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
    }),

    withToolCalls: () => ({
      id: 'chatcmpl-456',
      object: 'chat.completion',
      created: 1700000000,
      model: 'gpt-4',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_abc',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"location":"Paris"}',
                },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: { prompt_tokens: 15, completion_tokens: 20, total_tokens: 35 },
    }),

    withThinking: () => ({
      id: 'chatcmpl-789',
      object: 'chat.completion',
      created: 1700000000,
      model: 'gpt-4',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'The answer is 42.',
            content_blocks: [{ type: 'thinking', thinking: 'Let me think...' }],
          },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 20, completion_tokens: 50, total_tokens: 70 },
    }),

    maxTokens: () => ({
      id: 'chatcmpl-max',
      object: 'chat.completion',
      created: 1700000000,
      model: 'gpt-4',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Truncated...' },
          finish_reason: 'length',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 100, total_tokens: 110 },
    }),
  },

  // Streaming chunks
  streamChunks: {
    sequence: () => [
      'data: {"id":"chatcmpl-stream","model":"gpt-4","choices":[{"delta":{"role":"assistant"},"finish_reason":null}]}',
      'data: {"id":"chatcmpl-stream","model":"gpt-4","choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}',
      'data: {"id":"chatcmpl-stream","model":"gpt-4","choices":[{"delta":{"content":"!"},"finish_reason":null}]}',
      'data: {"id":"chatcmpl-stream","model":"gpt-4","choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2}}',
      'data: [DONE]',
    ],

    toolCall: () => [
      'data: {"id":"chatcmpl-tc","model":"gpt-4","choices":[{"delta":{"role":"assistant"},"finish_reason":null}]}',
      'data: {"id":"chatcmpl-tc","model":"gpt-4","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"search","arguments":""}}]},"finish_reason":null}]}',
      'data: {"id":"chatcmpl-tc","model":"gpt-4","choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"q\\":"}}]},"finish_reason":null}]}',
      'data: {"id":"chatcmpl-tc","model":"gpt-4","choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
      'data: [DONE]',
    ],
  },
};

// ============================================================================
// Request Transform Tests
// ============================================================================

describe('Messages → Chat Completions Request Transform', () => {
  test('simple message', () => {
    const result = transformMessagesToChatCompletions(
      fixtures.requests.simple()
    );
    expect(result.messages).toHaveLength(1);
  });

  test('with string system', () => {
    const result = transformMessagesToChatCompletions(
      fixtures.requests.withSystem()
    );
    expect(result.messages).toHaveLength(2);
    expect(result.messages![0].role).toBe('system');
  });

  test('with array system', () => {
    const result = transformMessagesToChatCompletions(
      fixtures.requests.withSystemArray()
    );
    expect(result.messages).toHaveLength(2);
    expect(result.messages![0].role).toBe('system');
    expect(result.messages![0].content).toContain('Be concise');
  });

  test('transforms tools correctly', () => {
    const result = transformMessagesToChatCompletions(
      fixtures.requests.withTools()
    );

    expect(result.tools).toHaveLength(1);
    expect(result.tools![0]).toMatchObject({
      type: 'function',
      function: {
        name: 'get_weather',
        parameters: expect.objectContaining({ type: 'object' }),
      },
    });
    expect(result.tool_choice).toBe('auto');
  });

  test('transforms tool_use and tool_result correctly', () => {
    const result = transformMessagesToChatCompletions(
      fixtures.requests.withToolUse()
    );

    // Should have: user, assistant with tool_calls, tool result
    expect(result.messages).toHaveLength(3);
    expect(result.messages![1].tool_calls).toBeDefined();
    expect(result.messages![2].role).toBe('tool');
  });

  test('transforms multimodal content correctly', () => {
    const result = transformMessagesToChatCompletions(
      fixtures.requests.multimodal()
    );

    expect(result.messages![0].content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'text' }),
        expect.objectContaining({ type: 'image_url' }),
      ])
    );
  });

  test('maps all parameters correctly', () => {
    const result = transformMessagesToChatCompletions(
      fixtures.requests.allParams()
    );

    expect(result).toMatchObject({
      temperature: 0.7,
      top_p: 0.9,
      stream: true,
      stop: ['END'],
      user: 'user_123',
    });
  });

  describe('tool_choice variants', () => {
    test.each([
      [{ type: 'auto' }, 'auto'],
      [{ type: 'any' }, 'required'],
      [
        { type: 'tool', name: 'my_func' },
        { type: 'function', function: { name: 'my_func' } },
      ],
    ])('%j → %j', (input, expected) => {
      const req = { ...fixtures.requests.simple(), tool_choice: input };
      const result = transformMessagesToChatCompletions(req);
      expect(result.tool_choice).toEqual(expected);
    });
  });
});

// ============================================================================
// Response Transform Tests
// ============================================================================

describe('Chat Completions → Messages Response Transform', () => {
  test('simple text response', () => {
    const result = transformChatCompletionsToMessages(
      fixtures.responses.simple() as any,
      200,
      'openai'
    );
    expect(result).toMatchObject({ type: 'message', role: 'assistant' });
    if ('error' in result) return;
    expect(result.content.some((c) => c.type === 'text')).toBe(true);
  });

  test('tool calls response', () => {
    const result = transformChatCompletionsToMessages(
      fixtures.responses.withToolCalls() as any,
      200,
      'openai'
    );
    expect(result).toMatchObject({ type: 'message', role: 'assistant' });
    if ('error' in result) return;
    expect(result.content.some((c) => c.type === 'tool_use')).toBe(true);
  });

  test('with thinking response', () => {
    const result = transformChatCompletionsToMessages(
      fixtures.responses.withThinking() as any,
      200,
      'openai'
    );
    expect(result).toMatchObject({ type: 'message', role: 'assistant' });
    if ('error' in result) return;
    expect(result.content.some((c) => c.type === 'thinking')).toBe(true);
  });

  test('max tokens response', () => {
    const result = transformChatCompletionsToMessages(
      fixtures.responses.maxTokens() as any,
      200,
      'openai'
    );
    expect(result).toMatchObject({ type: 'message', role: 'assistant' });
    if ('error' in result) return;
    expect(result.stop_reason).toBe('max_tokens');
  });

  test('maps usage correctly', () => {
    const result = transformChatCompletionsToMessages(
      fixtures.responses.simple() as any,
      200,
      'openai'
    );

    if ('error' in result) return;
    expect(result.usage).toMatchObject({
      input_tokens: 10,
      output_tokens: 8,
    });
  });

  test('passes through errors', () => {
    const errorResponse = {
      error: { message: 'Bad request', type: 'invalid_request_error' },
    };
    const result = transformChatCompletionsToMessages(
      errorResponse as any,
      400,
      'openai'
    );

    expect(result).toHaveProperty('error');
  });
});

// ============================================================================
// Stream Transform Tests
// ============================================================================

describe('Stream Transform', () => {
  function processStream(chunks: string[]) {
    const state = createStreamState();
    const events: string[] = [];

    for (const chunk of chunks) {
      const result = transformStreamChunk(chunk, state);
      if (result) events.push(result);
    }

    return { events, state, allOutput: events.join('') };
  }

  test('emits correct event sequence for text', () => {
    const { allOutput } = processStream(fixtures.streamChunks.sequence());

    // Check all required Anthropic streaming events
    expect(allOutput).toContain('message_start');
    expect(allOutput).toContain('content_block_start');
    expect(allOutput).toContain('content_block_delta');
    expect(allOutput).toContain('text_delta');
    expect(allOutput).toContain('"text":"Hello"');
    expect(allOutput).toContain('content_block_stop');
    expect(allOutput).toContain('message_delta');
    expect(allOutput).toContain('message_stop');
  });

  test('emits correct events for tool calls', () => {
    const { allOutput } = processStream(fixtures.streamChunks.toolCall());

    expect(allOutput).toContain('tool_use');
    expect(allOutput).toContain('input_json_delta');
    expect(allOutput).toContain('"stop_reason":"tool_use"');
  });

  test('tracks state correctly', () => {
    const { state } = processStream(fixtures.streamChunks.sequence());

    expect(state.hasStarted).toBe(true);
    expect(state.model).toBe('gpt-4');
    expect(state.stopReason).toBe('end_turn');
  });

  test.each([
    ['empty', ''],
    ['ping', ': ping'],
    ['malformed', 'data: {invalid}'],
  ])('skips %s chunks', (_name, chunk) => {
    const state = createStreamState();
    const result = transformStreamChunk(chunk, state);
    expect(result).toBeUndefined();
  });
});

// ============================================================================
// Native Provider Detection Tests
// ============================================================================

describe('Native Provider Detection', () => {
  test.each([
    ['anthropic', true],
    ['bedrock', true],
    ['openai', false],
    ['azure-openai', false],
    ['groq', false],
    ['google', false],
    ['ANTHROPIC', true], // case insensitive
  ])('%s → native: %s', (provider, expected) => {
    expect(supportsMessagesApiNatively(provider, 'claude-3.5-sonnet')).toBe(
      expected
    );
  });
});

// ============================================================================
// Round-trip Tests
// ============================================================================

describe('Round-trip Transformation', () => {
  test('preserves semantic meaning through transform chain', () => {
    // Original Messages API request
    const original = fixtures.requests.withSystem();

    // Transform to Chat Completions
    const chatReq = transformMessagesToChatCompletions(original);

    // Verify key data preserved
    expect(chatReq.model).toBe(original.model);
    expect(chatReq.max_tokens).toBe(original.max_tokens);
    expect(chatReq.messages![0].content).toBe(original.system);
    expect(chatReq.messages![1].content).toBe(original.messages[0].content);
  });

  test('response maintains structure through transform', () => {
    const chatResponse = fixtures.responses.simple();
    const messagesResponse = transformChatCompletionsToMessages(
      chatResponse as any,
      200,
      'openai'
    );

    if ('error' in messagesResponse) return;

    expect(messagesResponse.model).toBe(chatResponse.model);
    expect(messagesResponse.content[0].type).toBe('text');
    expect((messagesResponse.content[0] as any).text).toBe(
      chatResponse.choices[0].message.content
    );
  });
});
