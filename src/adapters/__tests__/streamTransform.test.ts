import {
  transformStreamChunk,
  createStreamState,
} from '../responses/streamTransform';

describe('Stream Transform', () => {
  describe('transformStreamChunk', () => {
    test('should initialize state and emit created/in_progress events on first chunk', () => {
      const state = createStreamState();
      const chunk =
        'data: {"id":"chat-123","object":"chat.completion.chunk","created":1700000000,"model":"claude-3","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}';

      const result = transformStreamChunk(chunk, state);

      expect(result).toBeDefined();
      expect(result).toContain('response.created');
      expect(result).toContain('response.in_progress');
      expect(result).toContain('response.output_item.added');
      expect(result).toContain('response.content_part.added');
      expect(state.hasStarted).toBe(true);
    });

    test('should emit delta events for content chunks', () => {
      const state = createStreamState();
      state.hasStarted = true;
      state.responseId = 'resp_123';
      state.outputItemId = 'msg_456';

      const chunk = 'data: {"choices":[{"delta":{"content":"Hello"}}]}';
      const result = transformStreamChunk(chunk, state);

      expect(result).toBeDefined();
      expect(result).toContain('response.output_text.delta');
      expect(result).toContain('"delta":"Hello"');
    });

    test('should emit completion events on [DONE]', () => {
      const state = createStreamState();
      state.hasStarted = true;
      state.responseId = 'resp_123';
      state.outputItemId = 'msg_456';
      state.model = 'claude-3';

      const result = transformStreamChunk('data: [DONE]', state);

      expect(result).toBeDefined();
      expect(result).toContain('response.output_text.done');
      expect(result).toContain('response.content_part.done');
      expect(result).toContain('response.output_item.done');
      expect(result).toContain('response.completed');
    });

    test('should skip empty chunks', () => {
      const state = createStreamState();
      const result = transformStreamChunk('', state);
      expect(result).toBeUndefined();
    });

    test('should skip non-data lines', () => {
      const state = createStreamState();
      const result = transformStreamChunk(': ping', state);
      expect(result).toBeUndefined();
    });

    test('should handle tool call delta', () => {
      const state = createStreamState();
      state.hasStarted = true;
      state.responseId = 'resp_123';

      const chunk =
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","type":"function","function":{"name":"get_weather","arguments":""}}]}}]}';
      const result = transformStreamChunk(chunk, state);

      expect(result).toBeDefined();
      expect(result).toContain('response.output_item.added');
      expect(result).toContain('function_call');
      expect(result).toContain('get_weather');
    });

    test('should handle tool call arguments delta', () => {
      const state = createStreamState();
      state.hasStarted = true;
      state.responseId = 'resp_123';

      const chunk =
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"loc"}}]}}]}';
      const result = transformStreamChunk(chunk, state);

      expect(result).toBeDefined();
      expect(result).toContain('response.function_call_arguments.delta');
    });

    test('should track usage from chunks', () => {
      const state = createStreamState();
      state.hasStarted = true;

      const chunk =
        'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5}}';
      transformStreamChunk(chunk, state);

      expect(state.inputTokens).toBe(10);
      expect(state.outputTokens).toBe(5);
    });
  });

  describe('createStreamState', () => {
    test('should create initial state with default values', () => {
      const state = createStreamState();

      expect(state.hasStarted).toBe(false);
      expect(state.responseId).toBe('');
      expect(state.outputItemId).toBe('');
      expect(state.contentPartIndex).toBe(0);
      expect(state.model).toBe('');
      expect(state.inputTokens).toBe(0);
      expect(state.outputTokens).toBe(0);
      expect(state.finishReason).toBeNull();
      expect(state.sequenceNumber).toBe(0);
      expect(state.accumulatedText).toBe('');
    });
  });

  describe('sequence_number', () => {
    test('should include sequence_number in all events starting from 0', () => {
      const state = createStreamState();
      const chunk =
        'data: {"id":"chat-123","object":"chat.completion.chunk","created":1700000000,"model":"gpt-4","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}';

      const result = transformStreamChunk(chunk, state);

      // Parse all events and check sequence_number
      const events = result!
        .split('\n\n')
        .filter((e) => e.startsWith('event:'))
        .map((e) => {
          const dataLine = e.split('\n').find((l) => l.startsWith('data:'));
          return JSON.parse(dataLine!.slice(5));
        });

      // Initial events should have sequence numbers 0, 1, 2, 3
      expect(events[0].sequence_number).toBe(0); // response.created
      expect(events[1].sequence_number).toBe(1); // response.in_progress
      expect(events[2].sequence_number).toBe(2); // response.output_item.added
      expect(events[3].sequence_number).toBe(3); // response.content_part.added
    });

    test('should increment sequence_number across multiple chunks', () => {
      const state = createStreamState();

      // First chunk (init)
      const chunk1 =
        'data: {"id":"chat-123","model":"gpt-4","choices":[{"delta":{"role":"assistant"}}]}';
      transformStreamChunk(chunk1, state);

      // After init, sequence should be at 4
      expect(state.sequenceNumber).toBe(4);

      // Content chunk
      const chunk2 = 'data: {"choices":[{"delta":{"content":"Hello"}}]}';
      transformStreamChunk(chunk2, state);

      // After content delta, sequence should be at 5
      expect(state.sequenceNumber).toBe(5);

      // Another content chunk
      const chunk3 = 'data: {"choices":[{"delta":{"content":" World"}}]}';
      transformStreamChunk(chunk3, state);

      // After another delta, sequence should be at 6
      expect(state.sequenceNumber).toBe(6);
    });

    test('should include sequence_number in completion events', () => {
      const state = createStreamState();
      state.hasStarted = true;
      state.responseId = 'resp_123';
      state.outputItemId = 'msg_456';
      state.model = 'gpt-4';
      state.sequenceNumber = 10; // Simulate some events already processed

      const result = transformStreamChunk('data: [DONE]', state);

      const events = result!
        .split('\n\n')
        .filter((e) => e.startsWith('event:'))
        .map((e) => {
          const dataLine = e.split('\n').find((l) => l.startsWith('data:'));
          return JSON.parse(dataLine!.slice(5));
        });

      // Completion events should continue from sequence 10
      expect(events[0].sequence_number).toBe(10); // response.output_text.done
      expect(events[1].sequence_number).toBe(11); // response.content_part.done
      expect(events[2].sequence_number).toBe(12); // response.output_item.done
      expect(events[3].sequence_number).toBe(13); // response.completed
    });
  });

  describe('accumulated text', () => {
    test('should accumulate text across content deltas', () => {
      const state = createStreamState();

      // Init
      const initChunk =
        'data: {"id":"chat-123","model":"gpt-4","choices":[{"delta":{"role":"assistant"}}]}';
      transformStreamChunk(initChunk, state);

      // Content chunks
      transformStreamChunk(
        'data: {"choices":[{"delta":{"content":"Hello"}}]}',
        state
      );
      expect(state.accumulatedText).toBe('Hello');

      transformStreamChunk(
        'data: {"choices":[{"delta":{"content":" "}}]}',
        state
      );
      expect(state.accumulatedText).toBe('Hello ');

      transformStreamChunk(
        'data: {"choices":[{"delta":{"content":"World"}}]}',
        state
      );
      expect(state.accumulatedText).toBe('Hello World');
    });

    test('should include accumulated text in response.completed event', () => {
      const state = createStreamState();
      state.hasStarted = true;
      state.responseId = 'resp_123';
      state.outputItemId = 'msg_456';
      state.model = 'gpt-4';
      state.accumulatedText = 'Hello World!';

      const result = transformStreamChunk('data: [DONE]', state);

      // Find the response.completed event
      const completedEvent = result!
        .split('\n\n')
        .filter((e) => e.includes('response.completed'))
        .map((e) => {
          const dataLine = e.split('\n').find((l) => l.startsWith('data:'));
          return JSON.parse(dataLine!.slice(5));
        })[0];

      expect(completedEvent.response.output).toBeDefined();
      expect(completedEvent.response.output.length).toBe(1);
      expect(completedEvent.response.output[0].content[0].text).toBe(
        'Hello World!'
      );
    });

    test('should include accumulated text in all done events', () => {
      const state = createStreamState();
      state.hasStarted = true;
      state.responseId = 'resp_123';
      state.outputItemId = 'msg_456';
      state.model = 'gpt-4';
      state.accumulatedText = 'Test message';

      const result = transformStreamChunk('data: [DONE]', state);

      // Check response.output_text.done
      expect(result).toContain('"text":"Test message"');

      // Check response.content_part.done
      expect(result).toContain(
        '"part":{"type":"output_text","text":"Test message"'
      );

      // Check response.output_item.done
      expect(result).toContain(
        '"content":[{"type":"output_text","text":"Test message"'
      );
    });
  });

  describe('input_tokens_details in stream', () => {
    test('should include input_tokens_details in response.completed usage', () => {
      const state = createStreamState();
      state.hasStarted = true;
      state.responseId = 'resp_123';
      state.outputItemId = 'msg_456';
      state.model = 'gpt-4';
      state.inputTokens = 100;
      state.outputTokens = 50;

      const result = transformStreamChunk('data: [DONE]', state);

      const completedEvent = result!
        .split('\n\n')
        .filter((e) => e.includes('response.completed'))
        .map((e) => {
          const dataLine = e.split('\n').find((l) => l.startsWith('data:'));
          return JSON.parse(dataLine!.slice(5));
        })[0];

      expect(completedEvent.response.usage.input_tokens_details).toBeDefined();
      expect(
        completedEvent.response.usage.input_tokens_details.cached_tokens
      ).toBe(0);
      expect(completedEvent.response.usage.output_tokens_details).toBeDefined();
      expect(
        completedEvent.response.usage.output_tokens_details.reasoning_tokens
      ).toBe(0);
    });
  });

  describe('Full Stream Sequence', () => {
    test('should correctly transform a complete streaming conversation', () => {
      const state = createStreamState();
      const allEvents: string[] = [];

      // Simulate a realistic Chat Completions stream sequence
      const streamChunks = [
        // First chunk with role
        'data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1700000000,"model":"claude-3-sonnet","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}',
        // Content chunks
        'data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1700000000,"model":"claude-3-sonnet","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}',
        'data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1700000000,"model":"claude-3-sonnet","choices":[{"index":0,"delta":{"content":"!"},"finish_reason":null}]}',
        'data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1700000000,"model":"claude-3-sonnet","choices":[{"index":0,"delta":{"content":" How"},"finish_reason":null}]}',
        'data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1700000000,"model":"claude-3-sonnet","choices":[{"index":0,"delta":{"content":" can"},"finish_reason":null}]}',
        'data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1700000000,"model":"claude-3-sonnet","choices":[{"index":0,"delta":{"content":" I"},"finish_reason":null}]}',
        'data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1700000000,"model":"claude-3-sonnet","choices":[{"index":0,"delta":{"content":" help?"},"finish_reason":null}]}',
        // Final chunk with finish_reason and usage
        'data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","created":1700000000,"model":"claude-3-sonnet","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":7,"total_tokens":17}}',
        // Done signal
        'data: [DONE]',
      ];

      // Process all chunks
      for (const chunk of streamChunks) {
        const result = transformStreamChunk(chunk, state);
        if (result) {
          allEvents.push(result);
        }
      }

      // Verify initial events were emitted
      const allOutput = allEvents.join('');
      expect(allOutput).toContain('response.created');
      expect(allOutput).toContain('response.in_progress');
      expect(allOutput).toContain('response.output_item.added');
      expect(allOutput).toContain('response.content_part.added');

      // Verify content deltas
      expect(allOutput).toContain('"delta":"Hello"');
      expect(allOutput).toContain('"delta":"!"');
      expect(allOutput).toContain('"delta":" How"');
      expect(allOutput).toContain('"delta":" can"');
      expect(allOutput).toContain('"delta":" I"');
      expect(allOutput).toContain('"delta":" help?"');

      // Verify completion events
      expect(allOutput).toContain('response.output_text.done');
      expect(allOutput).toContain('response.content_part.done');
      expect(allOutput).toContain('response.output_item.done');
      expect(allOutput).toContain('response.completed');

      // Verify state was tracked
      expect(state.hasStarted).toBe(true);
      expect(state.model).toBe('claude-3-sonnet');
      expect(state.inputTokens).toBe(10);
      expect(state.outputTokens).toBe(7);
      expect(state.finishReason).toBe('stop');
    });

    test('should correctly transform a tool call streaming sequence', () => {
      const state = createStreamState();
      const allEvents: string[] = [];

      // Simulate a tool call stream sequence
      const streamChunks = [
        // First chunk
        'data: {"id":"chatcmpl-xyz","object":"chat.completion.chunk","created":1700000000,"model":"claude-3-sonnet","choices":[{"index":0,"delta":{"role":"assistant","content":null},"finish_reason":null}]}',
        // Tool call name
        'data: {"id":"chatcmpl-xyz","object":"chat.completion.chunk","created":1700000000,"model":"claude-3-sonnet","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_abc123","type":"function","function":{"name":"get_weather","arguments":""}}]},"finish_reason":null}]}',
        // Tool call arguments in chunks
        'data: {"id":"chatcmpl-xyz","object":"chat.completion.chunk","created":1700000000,"model":"claude-3-sonnet","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"lo"}}]},"finish_reason":null}]}',
        'data: {"id":"chatcmpl-xyz","object":"chat.completion.chunk","created":1700000000,"model":"claude-3-sonnet","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"cation"}}]},"finish_reason":null}]}',
        'data: {"id":"chatcmpl-xyz","object":"chat.completion.chunk","created":1700000000,"model":"claude-3-sonnet","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\": \\"Pa"}}]},"finish_reason":null}]}',
        'data: {"id":"chatcmpl-xyz","object":"chat.completion.chunk","created":1700000000,"model":"claude-3-sonnet","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ris\\"}"}}]},"finish_reason":null}]}',
        // Finish
        'data: {"id":"chatcmpl-xyz","object":"chat.completion.chunk","created":1700000000,"model":"claude-3-sonnet","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":15,"completion_tokens":20,"total_tokens":35}}',
        'data: [DONE]',
      ];

      for (const chunk of streamChunks) {
        const result = transformStreamChunk(chunk, state);
        if (result) {
          allEvents.push(result);
        }
      }

      const allOutput = allEvents.join('');

      // Verify tool call events
      expect(allOutput).toContain('response.output_item.added');
      expect(allOutput).toContain('function_call');
      expect(allOutput).toContain('get_weather');
      expect(allOutput).toContain('call_abc123');

      // Verify arguments deltas
      expect(allOutput).toContain('response.function_call_arguments.delta');
      expect(allOutput).toContain('{\\"lo');
      expect(allOutput).toContain('cation');

      // Verify completion
      expect(allOutput).toContain('response.completed');

      // Verify state
      expect(state.finishReason).toBe('tool_calls');
      expect(state.inputTokens).toBe(15);
      expect(state.outputTokens).toBe(20);
    });

    test('should handle interleaved keepalive pings', () => {
      const state = createStreamState();
      const allEvents: string[] = [];

      // Stream with keepalive pings interspersed
      const streamChunks = [
        ': ping',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1700000000,"model":"gpt-4","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}',
        ': ping',
        '',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1700000000,"model":"gpt-4","choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":null}]}',
        ': ping',
        'data: [DONE]',
      ];

      for (const chunk of streamChunks) {
        const result = transformStreamChunk(chunk, state);
        if (result) {
          allEvents.push(result);
        }
      }

      const allOutput = allEvents.join('');

      // Should still have proper events despite pings
      expect(allOutput).toContain('response.created');
      expect(allOutput).toContain('"delta":"Hi"');
      expect(allOutput).toContain('response.completed');

      // Pings should not create any events (we should have exactly 3 event batches)
      expect(allEvents.length).toBe(3); // init, content, done
    });

    test('should handle malformed JSON gracefully', () => {
      const state = createStreamState();

      // Valid first chunk to initialize
      const initChunk =
        'data: {"id":"chat-123","model":"claude-3","choices":[{"delta":{"role":"assistant"}}]}';
      transformStreamChunk(initChunk, state);
      expect(state.hasStarted).toBe(true);

      // Malformed JSON should not throw, just return undefined
      const malformedChunks = [
        'data: {invalid json}',
        'data: {"incomplete":',
        'data: not json at all',
      ];

      for (const chunk of malformedChunks) {
        const result = transformStreamChunk(chunk, state);
        expect(result).toBeUndefined();
      }

      // State should still be valid
      expect(state.hasStarted).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('should handle multiple tool calls in same response', () => {
      const state = createStreamState();
      state.hasStarted = true;
      state.responseId = 'resp_123';

      // Two tool calls at different indices
      const chunk1 =
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"get_weather","arguments":""}}]}}]}';
      const chunk2 =
        'data: {"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_2","type":"function","function":{"name":"get_time","arguments":""}}]}}]}';

      const result1 = transformStreamChunk(chunk1, state);
      const result2 = transformStreamChunk(chunk2, state);

      expect(result1).toContain('get_weather');
      expect(result1).toContain('call_1');
      expect(result2).toContain('get_time');
      expect(result2).toContain('call_2');
    });

    test('should not emit completion events if stream never started', () => {
      const state = createStreamState();
      // Don't process any chunks, hasStarted is still false

      const result = transformStreamChunk('data: [DONE]', state);
      expect(result).toBeUndefined();
    });

    test('should handle chunks with only whitespace in content', () => {
      const state = createStreamState();
      state.hasStarted = true;
      state.responseId = 'resp_123';
      state.outputItemId = 'msg_456';

      const chunk = 'data: {"choices":[{"delta":{"content":"   "}}]}';
      const result = transformStreamChunk(chunk, state);

      expect(result).toBeDefined();
      expect(result).toContain('response.output_text.delta');
      expect(result).toContain('"delta":"   "');
    });

    test('should handle newlines in content', () => {
      const state = createStreamState();
      state.hasStarted = true;
      state.responseId = 'resp_123';
      state.outputItemId = 'msg_456';

      const chunk = 'data: {"choices":[{"delta":{"content":"Hello\\nWorld"}}]}';
      const result = transformStreamChunk(chunk, state);

      expect(result).toBeDefined();
      expect(result).toContain('response.output_text.delta');
      expect(result).toContain('Hello\\nWorld');
    });
  });
});
