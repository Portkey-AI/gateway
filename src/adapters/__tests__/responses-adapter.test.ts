import { transformResponsesToChatCompletions } from '../responses/requestTransform';
import { transformChatCompletionsToResponses } from '../responses/responseTransform';
import { OpenAIResponse } from '../../types/modelResponses';
import { Message, Params, Options } from '../../types/requestBody';
import { ProviderConfig } from '../../providers/types';
import { transformUsingProviderConfig } from './testUtils';

function createComposedRequestTransform(
  providerChatCompleteConfig: ProviderConfig,
  providerOptions?: Options
) {
  return (
    responsesRequest: Params,
    _requestHeaders: Record<string, string>
  ): Params => {
    const chatCompletionsRequest = transformResponsesToChatCompletions(
      responsesRequest as any
    );
    const providerRequest = transformUsingProviderConfig(
      providerChatCompleteConfig,
      chatCompletionsRequest,
      providerOptions
    );
    return providerRequest;
  };
}

function createComposedResponseTransform(
  providerChatCompleteResponseTransform: Function,
  provider: string
) {
  return (providerResponse: any, responseStatus: number) => {
    const chatCompletionsResponse =
      providerChatCompleteResponseTransform(providerResponse);
    if ('error' in chatCompletionsResponse) {
      return chatCompletionsResponse;
    }
    return transformChatCompletionsToResponses(
      chatCompletionsResponse,
      responseStatus,
      provider
    );
  };
}

// Simplified Anthropic-like chat complete config for testing
const MockAnthropicChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
  },
  messages: [
    {
      param: 'messages',
      required: true,
    },
    {
      param: 'system',
      required: false,
      transform: (params: Params) => {
        const messages = params.messages as any[] | undefined;
        if (!messages) return undefined;
        const systemMessages = messages.filter(
          (m) => m.role === 'system' || m.role === 'developer'
        );
        return systemMessages.map((m) => ({ type: 'text', text: m.content }));
      },
    },
  ],
  max_tokens: {
    param: 'max_tokens',
    required: true,
  },
  temperature: {
    param: 'temperature',
    default: 1,
    min: 0,
    max: 1,
  },
  top_p: {
    param: 'top_p',
  },
  stream: {
    param: 'stream',
    default: false,
  },
};

describe('Responses Adapter', () => {
  describe('transformResponsesToChatCompletions', () => {
    test('should transform simple string input to messages', () => {
      const responsesRequest = {
        model: 'claude-3-sonnet-20240229',
        input: 'Hello, how are you?',
      };

      const result = transformResponsesToChatCompletions(
        responsesRequest as any
      );
      const messages = result.messages as Message[];

      expect(result.model).toBe('claude-3-sonnet-20240229');
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        role: 'user',
        content: 'Hello, how are you?',
      });
    });

    test('should transform input with instructions to system + user messages', () => {
      const responsesRequest = {
        model: 'claude-3-sonnet-20240229',
        input: 'What is 2+2?',
        instructions: 'You are a helpful math tutor.',
      };

      const result = transformResponsesToChatCompletions(
        responsesRequest as any
      );
      const messages = result.messages as Message[];

      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({
        role: 'system',
        content: 'You are a helpful math tutor.',
      });
      expect(messages[1]).toEqual({
        role: 'user',
        content: 'What is 2+2?',
      });
    });

    test('should transform array input with messages', () => {
      const responsesRequest = {
        model: 'claude-3-sonnet-20240229',
        input: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'How are you?' },
        ],
      };

      const result = transformResponsesToChatCompletions(
        responsesRequest as any
      );
      const messages = result.messages as Message[];

      expect(messages).toHaveLength(3);
      expect(messages[0]).toEqual({ role: 'user', content: 'Hello' });
      expect(messages[1]).toEqual({ role: 'assistant', content: 'Hi there!' });
      expect(messages[2]).toEqual({ role: 'user', content: 'How are you?' });
    });

    test('should transform max_output_tokens to max_tokens', () => {
      const responsesRequest = {
        model: 'claude-3-sonnet-20240229',
        input: 'Hello',
        max_output_tokens: 1000,
      };

      const result = transformResponsesToChatCompletions(
        responsesRequest as any
      );
      expect(result.max_tokens).toBe(1000);
    });

    test('should transform temperature and top_p', () => {
      const responsesRequest = {
        model: 'claude-3-sonnet-20240229',
        input: 'Hello',
        temperature: 0.7,
        top_p: 0.9,
      };

      const result = transformResponsesToChatCompletions(
        responsesRequest as any
      );
      expect(result.temperature).toBe(0.7);
      expect(result.top_p).toBe(0.9);
    });

    test('should transform function tools', () => {
      const responsesRequest = {
        model: 'claude-3-sonnet-20240229',
        input: 'What is the weather?',
        tools: [
          {
            type: 'function',
            name: 'get_weather',
            description: 'Get the current weather',
            parameters: {
              type: 'object',
              properties: { location: { type: 'string' } },
            },
            strict: true,
          },
        ],
      };

      const result = transformResponsesToChatCompletions(
        responsesRequest as any
      );
      const tools = result.tools as any[];

      expect(tools).toHaveLength(1);
      expect(tools[0]).toEqual({
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get the current weather',
          parameters: {
            type: 'object',
            properties: { location: { type: 'string' } },
          },
        },
      });
    });

    test('should transform tool_choice', () => {
      const responsesRequest = {
        model: 'claude-3-sonnet-20240229',
        input: 'Hello',
        tool_choice: 'auto',
      };

      const result = transformResponsesToChatCompletions(
        responsesRequest as any
      );
      expect(result.tool_choice).toBe('auto');
    });

    test('should handle function call input items', () => {
      const responsesRequest = {
        model: 'claude-3-sonnet-20240229',
        input: [
          { role: 'user', content: 'What is the weather in Paris?' },
          {
            type: 'function_call',
            id: 'fc_123',
            call_id: 'call_abc',
            name: 'get_weather',
            arguments: '{"location": "Paris"}',
          },
          {
            type: 'function_call_output',
            call_id: 'call_abc',
            output: '{"temperature": 20, "condition": "sunny"}',
          },
        ],
      };

      const result = transformResponsesToChatCompletions(
        responsesRequest as any
      );
      const messages = result.messages as any[];

      expect(messages).toHaveLength(3);
      expect(messages[0]).toEqual({
        role: 'user',
        content: 'What is the weather in Paris?',
      });
      expect(messages[1]).toEqual({
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_abc',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: '{"location": "Paris"}',
            },
          },
        ],
      });
      expect(messages[2]).toEqual({
        role: 'tool',
        tool_call_id: 'call_abc',
        content: '{"temperature": 20, "condition": "sunny"}',
      });
    });

    test('should transform top_logprobs', () => {
      const responsesRequest = {
        model: 'gpt-4',
        input: 'Hello',
        top_logprobs: 5,
      };

      const result = transformResponsesToChatCompletions(
        responsesRequest as any
      );
      expect(result.top_logprobs).toBe(5);
    });

    test('should not set max_tokens when max_output_tokens is not provided', () => {
      // Provider configs handle defaults (e.g., Anthropic: 64000), so adapter doesn't set one
      const responsesRequest = {
        model: 'gpt-4',
        input: 'Hello',
      };

      const result = transformResponsesToChatCompletions(
        responsesRequest as any
      );
      expect(result.max_tokens).toBeUndefined();
    });

    test('should transform input_file to Chat Completions file format', () => {
      const responsesRequest = {
        model: 'gpt-4o',
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: 'What does this PDF say?' },
              {
                type: 'input_file',
                filename: 'document.pdf',
                file_data: 'data:application/pdf;base64,JVBERi0xLjQ...',
              },
            ],
          },
        ],
      };

      const result = transformResponsesToChatCompletions(
        responsesRequest as any
      );
      const messages = result.messages as any[];

      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(Array.isArray(messages[0].content)).toBe(true);
      expect(messages[0].content).toHaveLength(2);
      expect(messages[0].content[0]).toEqual({
        type: 'text',
        text: 'What does this PDF say?',
      });
      expect(messages[0].content[1]).toEqual({
        type: 'file',
        file: {
          filename: 'document.pdf',
          file_data: 'data:application/pdf;base64,JVBERi0xLjQ...',
          file_id: undefined,
        },
      });
    });

    test('should transform input_file with file_id', () => {
      const responsesRequest = {
        model: 'gpt-4o',
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: 'Summarize this file' },
              {
                type: 'input_file',
                file_id: 'file-abc123',
              },
            ],
          },
        ],
      };

      const result = transformResponsesToChatCompletions(
        responsesRequest as any
      );
      const messages = result.messages as any[];

      expect(messages[0].content[1]).toEqual({
        type: 'file',
        file: {
          filename: undefined,
          file_data: undefined,
          file_id: 'file-abc123',
        },
      });
    });
  });

  describe('transformChatCompletionsToResponses', () => {
    test('should transform a simple chat completion response', () => {
      const chatResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1700000000,
        model: 'claude-3-sonnet-20240229',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello! I am doing well, thank you for asking.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 },
      };

      const result = transformChatCompletionsToResponses(
        chatResponse as any,
        200,
        'anthropic'
      ) as OpenAIResponse;

      expect(result.object).toBe('response');
      expect(result.model).toBe('claude-3-sonnet-20240229');
      expect(result.status).toBe('completed');
      expect(result.output).toHaveLength(1);
      expect(result.output[0].type).toBe('message');
      expect((result.output[0] as any).content[0].type).toBe('output_text');
      expect((result.output[0] as any).content[0].text).toBe(
        'Hello! I am doing well, thank you for asking.'
      );
    });

    test('should transform a response with tool calls', () => {
      const chatResponse = {
        id: 'chatcmpl-123',
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
                  id: 'call_abc',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{"location": "Paris"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      };

      const result = transformChatCompletionsToResponses(
        chatResponse as any,
        200,
        'anthropic'
      ) as OpenAIResponse;

      expect(result.status).toBe('completed');
      expect(result.output).toHaveLength(1);
      expect(result.output[0].type).toBe('function_call');
      expect((result.output[0] as any).name).toBe('get_weather');
      expect((result.output[0] as any).arguments).toBe('{"location": "Paris"}');
    });

    test('should handle incomplete status from length finish_reason', () => {
      const chatResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1700000000,
        model: 'claude-3-sonnet-20240229',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'This is a truncated response...',
            },
            finish_reason: 'length',
          },
        ],
      };

      const result = transformChatCompletionsToResponses(
        chatResponse as any,
        200,
        'anthropic'
      ) as OpenAIResponse;

      expect(result.status).toBe('incomplete');
    });

    test('should transform usage correctly', () => {
      const chatResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1700000000,
        model: 'claude-3-sonnet-20240229',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello!' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          completion_tokens_details: { reasoning_tokens: 10 },
        },
      };

      const result = transformChatCompletionsToResponses(
        chatResponse as any,
        200,
        'anthropic'
      ) as OpenAIResponse;

      expect(result.usage).toBeDefined();
      expect(result.usage!.input_tokens).toBe(100);
      expect(result.usage!.output_tokens).toBe(50);
      expect(result.usage!.total_tokens).toBe(150);
      expect(result.usage!.output_tokens_details.reasoning_tokens).toBe(10);
    });

    test('should include input_tokens_details with cached_tokens', () => {
      const chatResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1700000000,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello!' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          prompt_tokens_details: { cached_tokens: 25 },
        },
      };

      const result = transformChatCompletionsToResponses(
        chatResponse as any,
        200,
        'openai'
      ) as OpenAIResponse;

      expect(result.usage).toBeDefined();
      expect(result.usage!.input_tokens_details).toBeDefined();
      expect(result.usage!.input_tokens_details.cached_tokens).toBe(25);
    });

    test('should default cached_tokens to 0 when not provided', () => {
      const chatResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1700000000,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello!' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
      };

      const result = transformChatCompletionsToResponses(
        chatResponse as any,
        200,
        'openai'
      ) as OpenAIResponse;

      expect(result.usage!.input_tokens_details).toBeDefined();
      expect(result.usage!.input_tokens_details.cached_tokens).toBe(0);
    });

    test('should transform reasoning/thinking content to summary array format', () => {
      const chatResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1700000000,
        model: 'claude-3-sonnet-20240229',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'The answer is 4.',
              content_blocks: [
                {
                  type: 'thinking',
                  thinking: 'Let me calculate 2+2. That equals 4.',
                },
              ],
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      };

      const result = transformChatCompletionsToResponses(
        chatResponse as any,
        200,
        'anthropic'
      ) as OpenAIResponse;

      // Should have both reasoning and message output items
      expect(result.output.length).toBe(2);

      // First output should be reasoning with summary array format
      const reasoningOutput = result.output[0];
      expect(reasoningOutput.type).toBe('reasoning');
      expect((reasoningOutput as any).summary).toBeDefined();
      expect(Array.isArray((reasoningOutput as any).summary)).toBe(true);
      expect((reasoningOutput as any).summary[0].type).toBe('summary_text');
      expect((reasoningOutput as any).summary[0].text).toBe(
        'Let me calculate 2+2. That equals 4.'
      );

      // Second output should be the message
      const messageOutput = result.output[1];
      expect(messageOutput.type).toBe('message');
    });

    test('should handle thinking block with text field instead of thinking field', () => {
      const chatResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1700000000,
        model: 'gemini-pro',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Done!',
              content_blocks: [
                {
                  type: 'thinking',
                  text: 'Processing the request...',
                },
              ],
            },
            finish_reason: 'stop',
          },
        ],
      };

      const result = transformChatCompletionsToResponses(
        chatResponse as any,
        200,
        'google'
      ) as OpenAIResponse;

      const reasoningOutput = result.output[0];
      expect(reasoningOutput.type).toBe('reasoning');
      expect((reasoningOutput as any).summary[0].text).toBe(
        'Processing the request...'
      );
    });
  });

  describe('createComposedRequestTransform', () => {
    test('should compose Responses → ChatCompletions → Anthropic transforms', () => {
      const composedTransform = createComposedRequestTransform(
        MockAnthropicChatCompleteConfig
      );

      const responsesRequest = {
        model: 'claude-3-sonnet-20240229',
        input: 'Hello, how are you?',
        instructions: 'You are a helpful assistant.',
        max_output_tokens: 1000,
        temperature: 0.7,
      };

      const result = composedTransform(responsesRequest, {});

      expect(result.model).toBe('claude-3-sonnet-20240229');
      expect(result.max_tokens).toBe(1000);
      expect(result.temperature).toBe(0.7);
      expect(result.messages).toBeDefined();
      expect(result.system).toBeDefined();
    });
  });

  describe('createComposedResponseTransform', () => {
    test('should compose Anthropic → ChatCompletions → Responses transforms', () => {
      const mockAnthropicTransform = jest
        .fn()
        .mockImplementation((response) => ({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1700000000,
          model: 'claude-3-sonnet-20240229',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: response.content[0].text },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }));

      const composedTransform = createComposedResponseTransform(
        mockAnthropicTransform,
        'anthropic'
      );

      const anthropicResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello from Claude!' }],
        stop_reason: 'end_turn',
        model: 'claude-3-sonnet-20240229',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      const result = composedTransform(
        anthropicResponse,
        200
      ) as OpenAIResponse;

      expect(result.object).toBe('response');
      expect(result.status).toBe('completed');
      expect(result.output).toBeDefined();
      expect(result.output[0].type).toBe('message');
    });
  });
});
