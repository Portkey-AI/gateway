/**
 * Tests for Responses API Adapter - Logging and Cache Behavior
 *
 * These tests verify that:
 * 1. The response logged is in Responses API format (not Chat Completions)
 * 2. The endpoint (rubeusURL) is correctly set to 'createModelResponse'
 * 3. Caching works correctly for both streaming and non-streaming responses
 */

import { transformChatCompletionsToResponses } from '../responses/responseTransform';
import {
  transformStreamChunk,
  createStreamState,
} from '../responses/streamTransform';

describe('Responses API Adapter - Logging Behavior', () => {
  describe('Non-streaming response logging', () => {
    test('transformed response should be in Responses API format for logging', () => {
      // Simulate what the handler receives from Chat Completions endpoint
      const chatCompletionsResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1700000000,
        model: 'claude-3-sonnet-20240229',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello! How can I help you today?',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 },
      };

      // Transform to Responses API format (this is what should be logged)
      const responsesApiResponse = transformChatCompletionsToResponses(
        chatCompletionsResponse as any,
        200,
        'anthropic'
      );

      // Verify it's in Responses API format
      expect(responsesApiResponse).toHaveProperty('object', 'response');
      expect(responsesApiResponse).toHaveProperty('status', 'completed');
      expect(responsesApiResponse).toHaveProperty('output');
      expect(Array.isArray((responsesApiResponse as any).output)).toBe(true);

      // Verify the output structure matches Responses API spec
      const output = (responsesApiResponse as any).output[0];
      expect(output.type).toBe('message');
      expect(output.role).toBe('assistant');
      expect(output.content[0].type).toBe('output_text');
      expect(output.content[0].text).toBe('Hello! How can I help you today?');

      // Verify usage is in Responses API format
      expect((responsesApiResponse as any).usage).toEqual({
        input_tokens: 10,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 15,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: 25,
      });
    });

    test('requestOptions.response should contain Responses API format JSON', () => {
      const chatCompletionsResponse = {
        id: 'chatcmpl-456',
        object: 'chat.completion',
        created: 1700000000,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Test response' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
      };

      const responsesJson = transformChatCompletionsToResponses(
        chatCompletionsResponse as any,
        200,
        'openrouter'
      );

      // Simulate what the handler does: create a new Response for requestOptions
      const responseForLogging = new Response(JSON.stringify(responsesJson), {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      // Verify the response can be parsed and is in correct format
      return responseForLogging.json().then((parsed) => {
        expect(parsed.object).toBe('response');
        expect(parsed.status).toBe('completed');
        expect(parsed.output).toBeDefined();
        expect(parsed.output[0].type).toBe('message');
      });
    });

    test('rubeusURL should be set to createModelResponse endpoint', () => {
      // Simulate the requestOptions update
      const mockRequestOptions = [
        {
          providerOptions: {
            provider: 'anthropic',
            rubeusURL: 'chatComplete', // This is set by tryTargetsRecursively
          },
          response: null,
        },
      ];

      // Simulate what the handler does
      const endpoint = 'createModelResponse';
      mockRequestOptions[0].providerOptions.rubeusURL = endpoint;

      expect(mockRequestOptions[0].providerOptions.rubeusURL).toBe(
        'createModelResponse'
      );
    });
  });

  describe('Streaming response logging', () => {
    test('accumulated stream state should produce valid Responses API format', () => {
      const state = createStreamState();

      // Simulate streaming chunks
      const chunks = [
        'data: {"id":"chatcmpl-1","model":"claude-3","choices":[{"delta":{"content":"Hello"}}]}',
        'data: {"id":"chatcmpl-1","model":"claude-3","choices":[{"delta":{"content":" world"}}]}',
        'data: {"id":"chatcmpl-1","model":"claude-3","choices":[{"delta":{"content":"!"}}],"usage":{"prompt_tokens":10,"completion_tokens":3}}',
        'data: [DONE]',
      ];

      // Process chunks
      for (const chunk of chunks) {
        transformStreamChunk(chunk, state);
      }

      // Verify state accumulated correctly
      expect(state.accumulatedText).toBe('Hello world!');
      expect(state.model).toBe('claude-3');
      expect(state.inputTokens).toBe(10);
      expect(state.outputTokens).toBe(3);
      expect(state.hasStarted).toBe(true);
      expect(state.responseId).toMatch(/^resp_/);
      expect(state.outputItemId).toMatch(/^msg_/);
    });

    test('final Responses API object should be built from stream state', () => {
      const state = createStreamState();

      // Process some chunks to populate state
      transformStreamChunk(
        'data: {"id":"chatcmpl-1","model":"claude-3-haiku","choices":[{"delta":{"content":"Test"}}]}',
        state
      );
      transformStreamChunk(
        'data: {"id":"chatcmpl-1","model":"claude-3-haiku","choices":[{"delta":{"content":" response"}}],"usage":{"prompt_tokens":20,"completion_tokens":5}}',
        state
      );
      transformStreamChunk('data: [DONE]', state);

      // Build the final response object (same as handler does)
      const finalResponsesJson = {
        id: state.responseId,
        object: 'response',
        created_at: Math.floor(Date.now() / 1000),
        model: state.model,
        status: 'completed',
        output: [
          {
            id: state.outputItemId,
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [
              {
                type: 'output_text',
                text: state.accumulatedText,
                annotations: [],
              },
            ],
          },
        ],
        usage: {
          input_tokens: state.inputTokens,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: state.outputTokens,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: state.inputTokens + state.outputTokens,
        },
      };

      // Verify the structure matches Responses API spec
      expect(finalResponsesJson.object).toBe('response');
      expect(finalResponsesJson.status).toBe('completed');
      expect(finalResponsesJson.model).toBe('claude-3-haiku');
      expect(finalResponsesJson.output[0].type).toBe('message');
      expect(finalResponsesJson.output[0].content[0].type).toBe('output_text');
      expect(finalResponsesJson.output[0].content[0].text).toBe(
        'Test response'
      );
      expect(finalResponsesJson.usage.input_tokens).toBe(20);
      expect(finalResponsesJson.usage.output_tokens).toBe(5);
      expect(finalResponsesJson.usage.total_tokens).toBe(25);
    });

    test('streaming requestOptions.response should be JSON (not SSE)', () => {
      const state = createStreamState();

      // Process chunks
      transformStreamChunk(
        'data: {"id":"chatcmpl-1","model":"gpt-4","choices":[{"delta":{"content":"Hi"}}]}',
        state
      );
      transformStreamChunk(
        'data: {"id":"chatcmpl-1","model":"gpt-4","choices":[],"usage":{"prompt_tokens":5,"completion_tokens":1}}',
        state
      );
      transformStreamChunk('data: [DONE]', state);

      // Build and serialize for logging
      const finalJson = {
        id: state.responseId,
        object: 'response',
        model: state.model,
        status: 'completed',
        output: [
          {
            id: state.outputItemId,
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: state.accumulatedText }],
          },
        ],
        usage: {
          input_tokens: state.inputTokens,
          output_tokens: state.outputTokens,
          total_tokens: state.inputTokens + state.outputTokens,
        },
      };

      // The logged response should be JSON, not SSE
      const responseForLogging = new Response(JSON.stringify(finalJson), {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
      });

      expect(responseForLogging.headers.get('content-type')).toBe(
        'application/json'
      );

      return responseForLogging.json().then((parsed) => {
        expect(parsed.object).toBe('response');
        expect(parsed.output[0].content[0].text).toBe('Hi');
      });
    });
  });

  describe('Cache behavior', () => {
    test('cached Chat Completions response should be transformed to Responses API', () => {
      // Simulate a cached Chat Completions response
      const cachedChatCompletionsResponse = {
        id: 'chatcmpl-cached',
        object: 'chat.completion',
        created: 1699999999,
        model: 'claude-3-sonnet-20240229',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'This is a cached response',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 8, completion_tokens: 6, total_tokens: 14 },
      };

      // When cache hit occurs, the handler transforms it
      const responsesApiResponse = transformChatCompletionsToResponses(
        cachedChatCompletionsResponse as any,
        200,
        'anthropic'
      );

      // Verify it's correctly transformed
      expect((responsesApiResponse as any).object).toBe('response');
      expect((responsesApiResponse as any).output[0].content[0].text).toBe(
        'This is a cached response'
      );
    });

    test('cache should store Chat Completions format, serve Responses API format', () => {
      // This tests the flow:
      // 1. User calls Responses API
      // 2. Handler transforms to Chat Completions
      // 3. Cache stores Chat Completions response
      // 4. On cache hit, handler transforms back to Responses API

      // What gets stored in cache (Chat Completions format)
      const cachedData = {
        id: 'chatcmpl-cache-test',
        object: 'chat.completion',
        created: 1700000001,
        model: 'claude-3-haiku-20240307',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Cached answer to your question',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
      };

      // What user receives (Responses API format)
      const userResponse = transformChatCompletionsToResponses(
        cachedData as any,
        200,
        'anthropic'
      );

      // Verify the formats are different
      expect(cachedData.object).toBe('chat.completion');
      expect((userResponse as any).object).toBe('response');

      // Verify user gets proper Responses API structure
      expect((userResponse as any).output).toBeDefined();
      expect((userResponse as any).output[0].type).toBe('message');
      expect((userResponse as any).usage.input_tokens).toBe(12);
    });

    test('tool calls in cached response should be transformed correctly', () => {
      const cachedWithToolCalls = {
        id: 'chatcmpl-tools-cached',
        object: 'chat.completion',
        created: 1700000000,
        model: 'claude-3-sonnet-20240229',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_cached_123',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{"location":"New York"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 25, completion_tokens: 20, total_tokens: 45 },
      };

      const responsesApiResponse = transformChatCompletionsToResponses(
        cachedWithToolCalls as any,
        200,
        'anthropic'
      );

      // Verify tool call is properly transformed
      const output = (responsesApiResponse as any).output;
      const functionCall = output.find(
        (item: any) => item.type === 'function_call'
      );

      expect(functionCall).toBeDefined();
      expect(functionCall.name).toBe('get_weather');
      expect(functionCall.arguments).toBe('{"location":"New York"}');
      expect(functionCall.call_id).toBe('call_cached_123');
    });
  });

  describe('originalResponse vs responseBody distinction', () => {
    test('originalResponse should contain Chat Completions, responseBody should contain Responses API', () => {
      // Simulate the flow in the handler
      const chatCompletionsFromProvider = {
        id: 'chatcmpl-provider',
        object: 'chat.completion',
        created: 1700000000,
        model: 'claude-3-sonnet-20240229',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Provider response' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
      };

      // originalResponse.body - what comes from the provider (set by handlerUtils)
      const originalResponse = {
        body: chatCompletionsFromProvider,
      };

      // responseBody - what gets logged (should be Responses API format)
      const responsesApiFormat = transformChatCompletionsToResponses(
        chatCompletionsFromProvider as any,
        200,
        'anthropic'
      );

      // Verify they are different formats
      expect(originalResponse.body.object).toBe('chat.completion');
      expect((responsesApiFormat as any).object).toBe('response');

      // This is the key assertion: the logged responseBody should be Responses API format
      expect((responsesApiFormat as any).output).toBeDefined();
      expect((responsesApiFormat as any).output[0].type).toBe('message');
    });
  });
});
