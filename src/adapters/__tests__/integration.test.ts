import { transformResponsesToChatCompletions } from '../responses/requestTransform';
import { transformChatCompletionsToResponses } from '../responses/responseTransform';
import { AnthropicChatCompleteConfig } from '../../providers/anthropic/chatComplete';
import { Params, Message } from '../../types/requestBody';
import { OpenAIResponse } from '../../types/modelResponses';
import { transformUsingProviderConfig } from './testUtils';

describe('Responses API Adapter - Anthropic Integration', () => {
  describe('Full Request Pipeline: Responses API → Anthropic', () => {
    test('simple text request is correctly transformed for Anthropic', () => {
      // Stage 1: Responses API → Chat Completions
      const responsesRequest = {
        model: 'claude-3-sonnet-20240229',
        input: 'Hello, how are you?',
        max_output_tokens: 1000,
      };

      const chatCompletionsRequest =
        transformResponsesToChatCompletions(responsesRequest);

      expect(chatCompletionsRequest.model).toBe('claude-3-sonnet-20240229');
      expect(chatCompletionsRequest.max_tokens).toBe(1000);
      expect((chatCompletionsRequest.messages as Message[])[0]).toEqual({
        role: 'user',
        content: 'Hello, how are you?',
      });

      // Stage 2: Chat Completions → Anthropic
      const anthropicRequest = transformUsingProviderConfig(
        AnthropicChatCompleteConfig,
        chatCompletionsRequest
      );

      expect(anthropicRequest.model).toBe('claude-3-sonnet-20240229');
      expect(anthropicRequest.max_tokens).toBe(1000);
      expect(anthropicRequest.messages).toBeDefined();
    });

    test('multi-turn conversation is correctly transformed', () => {
      const responsesRequest = {
        model: 'claude-3-sonnet-20240229',
        instructions: 'You are a helpful assistant.',
        input: [
          { role: 'user', content: 'What is 2+2?' },
          { role: 'assistant', content: '4' },
          { role: 'user', content: 'And 3+3?' },
        ],
        max_output_tokens: 500,
      };

      const chatCompletionsRequest =
        transformResponsesToChatCompletions(responsesRequest);
      const messages = chatCompletionsRequest.messages as Message[];

      // Should have system + 3 conversation messages
      expect(messages).toHaveLength(4);
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toBe('You are a helpful assistant.');

      const anthropicRequest = transformUsingProviderConfig(
        AnthropicChatCompleteConfig,
        chatCompletionsRequest
      );

      expect(anthropicRequest.system).toBeDefined();
      expect(anthropicRequest.messages).toBeDefined();
    });

    test('tool call request is correctly transformed', () => {
      const responsesRequest = {
        model: 'claude-3-sonnet-20240229',
        input: 'What is the weather in Paris?',
        max_output_tokens: 1000,
        tools: [
          {
            type: 'function',
            name: 'get_weather',
            description: 'Get weather for a location',
            parameters: {
              type: 'object',
              properties: { location: { type: 'string' } },
              required: ['location'],
            },
          },
        ],
      };

      const chatCompletionsRequest =
        transformResponsesToChatCompletions(responsesRequest);

      expect(chatCompletionsRequest.tools).toHaveLength(1);
      expect((chatCompletionsRequest.tools as any[])[0].function.name).toBe(
        'get_weather'
      );

      const anthropicRequest = transformUsingProviderConfig(
        AnthropicChatCompleteConfig,
        chatCompletionsRequest
      );

      expect(anthropicRequest.tools).toBeDefined();
    });
  });

  describe('Full Response Pipeline: Anthropic → Responses API', () => {
    test('simple text response is correctly transformed', () => {
      // Simulated Chat Completions response (as if from Anthropic transform)
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
              content: 'Hello! I am doing great, thank you for asking.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 12, total_tokens: 22 },
      };

      const responsesApiResponse = transformChatCompletionsToResponses(
        chatCompletionsResponse as any,
        200,
        'anthropic'
      ) as OpenAIResponse;

      expect(responsesApiResponse.object).toBe('response');
      expect(responsesApiResponse.status).toBe('completed');
      expect(responsesApiResponse.output).toHaveLength(1);
      expect(responsesApiResponse.output[0].type).toBe('message');
      expect((responsesApiResponse.output[0] as any).content[0].text).toBe(
        'Hello! I am doing great, thank you for asking.'
      );
    });

    test('tool call response is correctly transformed', () => {
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
              content: null,
              tool_calls: [
                {
                  id: 'call_abc123',
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
        usage: { prompt_tokens: 20, completion_tokens: 15, total_tokens: 35 },
      };

      const responsesApiResponse = transformChatCompletionsToResponses(
        chatCompletionsResponse as any,
        200,
        'anthropic'
      ) as OpenAIResponse;

      expect(responsesApiResponse.status).toBe('completed');
      // Should have function_call output item
      const functionCallItem = responsesApiResponse.output.find(
        (item) => item.type === 'function_call'
      );
      expect(functionCallItem).toBeDefined();
      expect((functionCallItem as any).name).toBe('get_weather');
      expect((functionCallItem as any).arguments).toBe('{"location":"Paris"}');
    });

    test('usage is correctly transformed', () => {
      const chatCompletionsResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1700000000,
        model: 'claude-3-sonnet-20240229',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Test' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      };

      const responsesApiResponse = transformChatCompletionsToResponses(
        chatCompletionsResponse as any,
        200,
        'anthropic'
      ) as OpenAIResponse;

      expect(responsesApiResponse.usage).toBeDefined();
      expect(responsesApiResponse.usage?.input_tokens).toBe(100);
      expect(responsesApiResponse.usage?.output_tokens).toBe(50);
      expect(responsesApiResponse.usage?.total_tokens).toBe(150);
    });
  });

  describe('Round-trip verification', () => {
    test('request-response round trip maintains data integrity', () => {
      // Original Responses API request
      const originalRequest = {
        model: 'claude-3-sonnet-20240229',
        input: 'Tell me a joke',
        max_output_tokens: 500,
        temperature: 0.8,
      };

      // Transform to Chat Completions
      const chatRequest = transformResponsesToChatCompletions(originalRequest);
      expect(chatRequest.model).toBe(originalRequest.model);
      expect(chatRequest.max_tokens).toBe(originalRequest.max_output_tokens);
      expect(chatRequest.temperature).toBe(originalRequest.temperature);

      // Simulate response
      const chatResponse = {
        id: 'chatcmpl-xyz',
        object: 'chat.completion',
        created: Date.now(),
        model: originalRequest.model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Why did the chicken cross the road?',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
      };

      // Transform back to Responses API
      const responsesResponse = transformChatCompletionsToResponses(
        chatResponse as any,
        200,
        'anthropic'
      ) as OpenAIResponse;

      expect(responsesResponse.model).toBe(originalRequest.model);
      expect(responsesResponse.status).toBe('completed');
      expect(responsesResponse.output[0].type).toBe('message');
    });
  });
});
