jest.mock('../../../data-stores/redis', () => ({
  redisClient: null,
  redisReaderClient: null,
}));

jest.mock('../../../utils/awsAuth', () => ({}));

jest.mock('../../..', () => ({}));

import {
  DeepSeekChatCompleteConfig,
  DeepSeekChatCompleteResponseTransform,
  DeepSeekChatCompleteStreamChunkTransform,
} from '../chatComplete';
import { transformUsingProviderConfig } from '../../../services/transformToProviderRequest';
import { Params } from '../../../types/requestBody';

describe('DeepSeek Chat Completion', () => {
  describe('Message Role Transformation', () => {
    it('should transform developer role to system role', () => {
      const params = {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'developer',
            content: 'You are a helpful assistant',
          },
          {
            role: 'user',
            content: 'Hello',
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        DeepSeekChatCompleteConfig,
        params
      );

      expect(transformedRequest.messages).toHaveLength(2);
      expect(transformedRequest.messages[0].role).toBe('system');
      expect(transformedRequest.messages[0].content).toBe(
        'You are a helpful assistant'
      );
      expect(transformedRequest.messages[1].role).toBe('user');
    });

    it('should keep system role as-is', () => {
      const params = {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant',
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        DeepSeekChatCompleteConfig,
        params
      );

      expect(transformedRequest.messages[0].role).toBe('system');
    });

    it('should keep user role as-is', () => {
      const params = {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        DeepSeekChatCompleteConfig,
        params
      );

      expect(transformedRequest.messages[0].role).toBe('user');
    });

    it('should keep assistant role as-is', () => {
      const params = {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'assistant',
            content: 'Hello! How can I help?',
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        DeepSeekChatCompleteConfig,
        params
      );

      expect(transformedRequest.messages[0].role).toBe('assistant');
    });
  });

  describe('Configuration Parameters', () => {
    it('should use default model when not provided', () => {
      const params = {
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        DeepSeekChatCompleteConfig,
        params
      );

      expect(transformedRequest.model).toBe('deepseek-chat');
    });

    it('should respect provided model', () => {
      const params = {
        model: 'deepseek-coder',
        messages: [
          {
            role: 'user',
            content: 'Write code',
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        DeepSeekChatCompleteConfig,
        params
      );

      expect(transformedRequest.model).toBe('deepseek-coder');
    });

    it('should handle max_tokens parameter', () => {
      const params = {
        model: 'deepseek-chat',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        DeepSeekChatCompleteConfig,
        params
      );

      expect(transformedRequest.max_tokens).toBe(1000);
    });

    it('should handle max_completion_tokens parameter as max_tokens', () => {
      const params = {
        model: 'deepseek-chat',
        max_completion_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        DeepSeekChatCompleteConfig,
        params
      );

      expect(transformedRequest.max_tokens).toBe(2000);
    });

    it('should handle temperature parameter within valid range', () => {
      const params = {
        model: 'deepseek-chat',
        temperature: 0.7,
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        DeepSeekChatCompleteConfig,
        params
      );

      expect(transformedRequest.temperature).toBe(0.7);
    });

    it('should handle top_p parameter', () => {
      const params = {
        model: 'deepseek-chat',
        top_p: 0.9,
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        DeepSeekChatCompleteConfig,
        params
      );

      expect(transformedRequest.top_p).toBe(0.9);
    });

    it('should handle frequency_penalty parameter', () => {
      const params = {
        model: 'deepseek-chat',
        frequency_penalty: 0.5,
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        DeepSeekChatCompleteConfig,
        params
      );

      expect(transformedRequest.frequency_penalty).toBe(0.5);
    });

    it('should handle presence_penalty parameter', () => {
      const params = {
        model: 'deepseek-chat',
        presence_penalty: -0.5,
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        DeepSeekChatCompleteConfig,
        params
      );

      expect(transformedRequest.presence_penalty).toBe(-0.5);
    });

    it('should handle stream parameter', () => {
      const params = {
        model: 'deepseek-chat',
        stream: true,
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        DeepSeekChatCompleteConfig,
        params
      );

      expect(transformedRequest.stream).toBe(true);
    });

    it('should handle stop parameter', () => {
      const params = {
        model: 'deepseek-chat',
        stop: ['<|end|>', '\n\n'],
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        DeepSeekChatCompleteConfig,
        params
      );

      expect(transformedRequest.stop).toEqual(['<|end|>', '\n\n']);
    });

    it('should handle response_format parameter', () => {
      const params = {
        model: 'deepseek-chat',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        DeepSeekChatCompleteConfig,
        params
      );

      expect(transformedRequest.response_format).toEqual({
        type: 'json_object',
      });
    });

    it('should handle tools parameter', () => {
      const tools = [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get the weather',
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string' },
              },
            },
          },
        },
      ];

      const params = {
        model: 'deepseek-chat',
        tools,
        messages: [
          {
            role: 'user',
            content: 'What is the weather?',
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        DeepSeekChatCompleteConfig,
        params
      );

      expect(transformedRequest.tools).toEqual(tools);
    });

    it('should handle tool_choice parameter', () => {
      const params = {
        model: 'deepseek-chat',
        tool_choice: 'auto',
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        DeepSeekChatCompleteConfig,
        params
      );

      expect(transformedRequest.tool_choice).toBe('auto');
    });

    it('should not forward legacy functions/function_call fields', () => {
      const params = {
        model: 'deepseek-chat',
        functions: [
          {
            name: 'legacy_tool',
          },
        ],
        function_call: 'auto',
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        DeepSeekChatCompleteConfig,
        params
      );

      expect((transformedRequest as any).functions).toBeUndefined();
      expect((transformedRequest as any).function_call).toBeUndefined();
    });

    it('should handle logprobs parameter', () => {
      const params = {
        model: 'deepseek-chat',
        logprobs: 1,
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        DeepSeekChatCompleteConfig,
        params
      );

      expect(transformedRequest.logprobs).toBe(1);
    });

    it('should handle top_logprobs parameter', () => {
      const params = {
        model: 'deepseek-chat',
        top_logprobs: true,
        messages: [
          {
            role: 'user',
            content: 'Hello',
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        DeepSeekChatCompleteConfig,
        params
      );

      expect(transformedRequest.top_logprobs).toBe(true);
    });
  });

  describe('Response Transformation', () => {
    it('should transform successful chat completion response', () => {
      const response = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'deepseek-chat',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello! How can I help you?',
              tool_calls: null,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 15,
          total_tokens: 25,
        },
      };

      const transformedResponse = DeepSeekChatCompleteResponseTransform(
        response as any,
        200,
        new Headers(),
        false
      );

      expect(transformedResponse).toHaveProperty('id', 'chatcmpl-123');
      expect(transformedResponse).toHaveProperty('object', 'chat.completion');
      expect(transformedResponse).toHaveProperty('model', 'deepseek-chat');
      expect(transformedResponse).toHaveProperty('provider', 'deepseek');
      expect((transformedResponse as any).choices).toHaveLength(1);
      expect((transformedResponse as any).choices[0].message.content).toBe(
        'Hello! How can I help you?'
      );
      expect((transformedResponse as any).usage.total_tokens).toBe(25);
    });

    it('should handle multiple choices in response', () => {
      const response = {
        id: 'chatcmpl-456',
        object: 'chat.completion',
        created: 1234567890,
        model: 'deepseek-chat',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Response 1',
              tool_calls: null,
            },
            finish_reason: 'stop',
          },
          {
            index: 1,
            message: {
              role: 'assistant',
              content: 'Response 2',
              tool_calls: null,
            },
            finish_reason: 'length',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      const transformedResponse = DeepSeekChatCompleteResponseTransform(
        response as any,
        200,
        new Headers(),
        false
      );

      expect((transformedResponse as any).choices).toHaveLength(2);
      expect((transformedResponse as any).choices[0].message.content).toBe(
        'Response 1'
      );
      expect((transformedResponse as any).choices[1].message.content).toBe(
        'Response 2'
      );
    });

    it('should handle tool calls in response', () => {
      const response = {
        id: 'chatcmpl-789',
        object: 'chat.completion',
        created: 1234567890,
        model: 'deepseek-chat',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_123',
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
        usage: {
          prompt_tokens: 10,
          completion_tokens: 15,
          total_tokens: 25,
        },
      };

      const transformedResponse = DeepSeekChatCompleteResponseTransform(
        response as any,
        200,
        new Headers(),
        false
      );

      expect(
        (transformedResponse as any).choices[0].message.tool_calls
      ).toHaveLength(1);
      expect(
        (transformedResponse as any).choices[0].message.tool_calls[0].function
          .name
      ).toBe('get_weather');
    });

    it('should transform error response with 500 status', () => {
      const errorResponse = {
        object: 'error',
        message: 'Internal server error',
        type: 'server_error',
        param: null,
        code: 'server_error',
      };

      const transformedResponse = DeepSeekChatCompleteResponseTransform(
        errorResponse as any,
        500,
        new Headers(),
        false
      );

      expect(transformedResponse).toHaveProperty('error');
      expect((transformedResponse as any).error).toHaveProperty('message');
      expect((transformedResponse as any).error.message).toContain(
        'Internal server error'
      );
    });

    it('should handle finish_reason transformation', () => {
      const response = {
        id: 'chatcmpl-999',
        object: 'chat.completion',
        created: 1234567890,
        model: 'deepseek-chat',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Response',
              tool_calls: null,
            },
            finish_reason: 'content_filter',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 15,
          total_tokens: 25,
        },
      };

      const transformedResponse = DeepSeekChatCompleteResponseTransform(
        response as any,
        200,
        new Headers(),
        false
      );

      expect((transformedResponse as any).choices[0].finish_reason).toBe(
        'content_filter'
      );
    });

    it('should handle usage information in response', () => {
      const response = {
        id: 'chatcmpl-usage',
        object: 'chat.completion',
        created: 1234567890,
        model: 'deepseek-chat',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Response',
              tool_calls: null,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 200,
          total_tokens: 300,
        },
      };

      const transformedResponse = DeepSeekChatCompleteResponseTransform(
        response as any,
        200,
        new Headers(),
        false
      );

      expect((transformedResponse as any).usage).toEqual({
        prompt_tokens: 100,
        completion_tokens: 200,
        total_tokens: 300,
      });
    });
  });

  describe('Stream Chunk Transformation', () => {
    it('should transform stream chunk with content', () => {
      const chunk =
        'data: {"id":"chatcmpl-stream","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-chat","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}';

      const transformedChunk = DeepSeekChatCompleteStreamChunkTransform(
        chunk,
        'fallback-id',
        {},
        false
      );

      const chunkString = transformedChunk as string;
      expect(chunkString).toContain('"role":"assistant"');
      expect(chunkString).toContain('"content":"Hello"');
      expect(chunkString).toContain('"provider":"deepseek"');
    });

    it('should handle [DONE] stream marker', () => {
      const chunk = 'data: [DONE]';

      const transformedChunk = DeepSeekChatCompleteStreamChunkTransform(
        chunk,
        'fallback-id',
        {},
        false
      );

      expect(transformedChunk).toBe('data: [DONE]\n\n');
    });

    it('should handle stream chunk with tool calls', () => {
      const chunk =
        'data: {"id":"chatcmpl-stream-tools","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-chat","choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"id":"call_123","type":"function","function":{"name":"get_weather","arguments":"{}"}}]},"finish_reason":null}]}';

      const transformedChunk = DeepSeekChatCompleteStreamChunkTransform(
        chunk,
        'fallback-id',
        {},
        false
      );

      const chunkString = transformedChunk as string;
      expect(chunkString).toContain('"tool_calls"');
      expect(chunkString).toContain('"get_weather"');
    });

    it('should handle stream chunk with usage information', () => {
      const chunk =
        'data: {"id":"chatcmpl-stream-usage","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-chat","choices":[{"index":0,"delta":{"content":""},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}';

      const transformedChunk = DeepSeekChatCompleteStreamChunkTransform(
        chunk,
        'fallback-id',
        {},
        false
      );

      const chunkString = transformedChunk as string;
      expect(chunkString).toContain('"prompt_tokens":10');
      expect(chunkString).toContain('"completion_tokens":20');
      expect(chunkString).toContain('"total_tokens":30');
    });

    it('should handle stream chunk with finish_reason', () => {
      const chunk =
        'data: {"id":"chatcmpl-stream-finish","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-chat","choices":[{"index":0,"delta":{"content":"finished"},"finish_reason":"stop"}]}';

      const transformedChunk = DeepSeekChatCompleteStreamChunkTransform(
        chunk,
        'fallback-id',
        {},
        false
      );

      const chunkString = transformedChunk as string;
      expect(chunkString).toContain('"finish_reason":"stop"');
    });

    it('should strip data prefix from chunk', () => {
      const chunk =
        'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-chat","choices":[{"index":0,"delta":{"content":"test"},"finish_reason":null}]}';

      const transformedChunk = DeepSeekChatCompleteStreamChunkTransform(
        chunk,
        'fallback-id',
        {},
        false
      );

      const chunkString = transformedChunk as string;
      expect(chunkString).toContain('data:');
      // Verify structure is valid JSON after data prefix
      const parsed = JSON.parse(chunkString.replace('data: ', ''));
      expect(parsed).toHaveProperty('id');
      expect(parsed).toHaveProperty('provider', 'deepseek');
    });

    it('should add provider field to stream chunk', () => {
      const chunk =
        'data: {"id":"chatcmpl-provider-test","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-chat","choices":[{"index":0,"delta":{"content":"test"},"finish_reason":null}]}';

      const transformedChunk = DeepSeekChatCompleteStreamChunkTransform(
        chunk,
        'fallback-id',
        {},
        false
      );

      const chunkString = transformedChunk as string;
      const parsed = JSON.parse(chunkString.replace('data: ', ''));
      expect(parsed.provider).toBe('deepseek');
    });
  });

  describe('Finish Reason Handling', () => {
    it('should handle stop finish reason', () => {
      const response = {
        id: 'chatcmpl-reason-stop',
        object: 'chat.completion',
        created: 1234567890,
        model: 'deepseek-chat',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Response',
              tool_calls: null,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 15,
          total_tokens: 25,
        },
      };

      const transformedResponse = DeepSeekChatCompleteResponseTransform(
        response as any,
        200,
        new Headers(),
        false
      );

      expect((transformedResponse as any).choices[0].finish_reason).toBe(
        'stop'
      );
    });

    it('should handle length finish reason', () => {
      const response = {
        id: 'chatcmpl-reason-length',
        object: 'chat.completion',
        created: 1234567890,
        model: 'deepseek-chat',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Incomplete response...',
              tool_calls: null,
            },
            finish_reason: 'length',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 15,
          total_tokens: 25,
        },
      };

      const transformedResponse = DeepSeekChatCompleteResponseTransform(
        response as any,
        200,
        new Headers(),
        false
      );

      expect((transformedResponse as any).choices[0].finish_reason).toBe(
        'length'
      );
    });

    it('should handle tool_calls finish reason', () => {
      const response = {
        id: 'chatcmpl-reason-tools',
        object: 'chat.completion',
        created: 1234567890,
        model: 'deepseek-chat',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_tool',
                  type: 'function',
                  function: {
                    name: 'some_tool',
                    arguments: '{}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 15,
          total_tokens: 25,
        },
      };

      const transformedResponse = DeepSeekChatCompleteResponseTransform(
        response as any,
        200,
        new Headers(),
        false
      );

      expect((transformedResponse as any).choices[0].finish_reason).toBe(
        'tool_calls'
      );
    });

    it('should map deepseek-specific finish_reason in strict OpenAI mode', () => {
      const response = {
        id: 'chatcmpl-reason-strict',
        object: 'chat.completion',
        created: 1234567890,
        model: 'deepseek-chat',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Response',
              tool_calls: null,
            },
            finish_reason: 'insufficient_system_resource',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 15,
          total_tokens: 25,
        },
      };

      const transformedResponse = DeepSeekChatCompleteResponseTransform(
        response as any,
        200,
        new Headers(),
        true
      );

      expect((transformedResponse as any).choices[0].finish_reason).toBe(
        'stop'
      );
    });

    it('should preserve provider finish_reason in non-strict mode', () => {
      const response = {
        id: 'chatcmpl-reason-nonstrict',
        object: 'chat.completion',
        created: 1234567890,
        model: 'deepseek-chat',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Response',
              tool_calls: null,
            },
            finish_reason: 'insufficient_system_resource',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 15,
          total_tokens: 25,
        },
      };

      const transformedResponse = DeepSeekChatCompleteResponseTransform(
        response as any,
        200,
        new Headers(),
        false
      );

      expect((transformedResponse as any).choices[0].finish_reason).toBe(
        'insufficient_system_resource'
      );
    });
  });

  describe('Stream Finish Reason Mapping', () => {
    it('should map stream finish_reason in strict OpenAI mode', () => {
      const chunk =
        'data: {"id":"chatcmpl-stream-strict","object":"chat.completion.chunk","created":1234567890,"model":"deepseek-chat","choices":[{"index":0,"delta":{"content":""},"finish_reason":"insufficient_system_resource"}]}';

      const transformedChunk = DeepSeekChatCompleteStreamChunkTransform(
        chunk,
        'fallback-id',
        {},
        true
      );

      const parsed = JSON.parse(
        (transformedChunk as string).replace('data: ', '')
      );
      expect(parsed.choices[0].finish_reason).toBe('stop');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty messages array', () => {
      const params = {
        model: 'deepseek-chat',
        messages: [],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        DeepSeekChatCompleteConfig,
        params
      );

      expect(transformedRequest.messages).toEqual([]);
    });

    it('should handle messages with undefined content', () => {
      const params = {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'assistant',
            content: undefined,
          },
        ],
      } as Params;

      const transformedRequest = transformUsingProviderConfig(
        DeepSeekChatCompleteConfig,
        params
      );

      expect(transformedRequest.messages[0].content).toBeUndefined();
    });

    it('should handle response with null usage', () => {
      const response = {
        id: 'chatcmpl-null-usage',
        object: 'chat.completion',
        created: 1234567890,
        model: 'deepseek-chat',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Response',
              tool_calls: null,
            },
            finish_reason: 'stop',
          },
        ],
        usage: null,
      };

      const transformedResponse = DeepSeekChatCompleteResponseTransform(
        response as any,
        200,
        new Headers(),
        false
      );

      expect((transformedResponse as any).usage).toBeDefined();
    });

    it('should handle response without usage field', () => {
      const response = {
        id: 'chatcmpl-no-usage',
        object: 'chat.completion',
        created: 1234567890,
        model: 'deepseek-chat',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Response',
              tool_calls: null,
            },
            finish_reason: 'stop',
          },
        ],
      } as any;

      const transformedResponse = DeepSeekChatCompleteResponseTransform(
        response,
        200,
        new Headers(),
        false
      );

      expect((transformedResponse as any).usage).toEqual({
        prompt_tokens: undefined,
        completion_tokens: undefined,
        total_tokens: undefined,
      });
    });
  });
});
