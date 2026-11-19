import { Context } from 'hono';
import providersData from '../../data/providers.json';
import { ABLITERATEDLLM, VALID_PROVIDERS } from '../../globals';
import { OpenAIChatCompleteConfig } from '../openai/chatComplete';
import { ParameterConfig, ProviderConfig } from '../types';
import { Options, Params } from '../../types/requestBody';
import AbliteratedLLMAPIConfig from './api';
import AbliteratedLLMConfig from './index';

describe('AbliteratedLLM provider', () => {
  const providerOptions: Options = {
    provider: ABLITERATEDLLM,
    apiKey: 'test-api-key',
  };

  describe('registration and metadata', () => {
    it('exports ABLITERATEDLLM constant and registers in VALID_PROVIDERS', () => {
      expect(ABLITERATEDLLM).toBe('abliteratedllm');
      expect(VALID_PROVIDERS).toContain(ABLITERATEDLLM);
    });

    it('includes abliteratedllm metadata in src/data/providers.json', () => {
      const entry = providersData.data.find(
        (provider) => provider.id === ABLITERATEDLLM
      );
      expect(entry).toMatchObject({
        id: 'abliteratedllm',
        name: 'AbliteratedLLM',
        object: 'provider',
        base_url: 'https://api.abliteratedllm.dev/v1',
      });
    });
  });

  describe('AbliteratedLLMAPIConfig', () => {
    const mockContext = {} as unknown as Context;
    const baseArgs = {
      c: mockContext,
      providerOptions,
      gatewayRequestURL: 'http://localhost:8787/v1/chat/completions',
      gatewayRequestBodyJSON: {} as Params,
      transformedRequestBody: {},
      transformedRequestUrl:
        'https://api.abliteratedllm.dev/v1/chat/completions',
    };

    it('returns the canonical base URL', () => {
      expect(AbliteratedLLMAPIConfig.getBaseURL(baseArgs)).toBe(
        'https://api.abliteratedllm.dev/v1'
      );
    });

    it('returns Bearer Authorization header', () => {
      expect(
        AbliteratedLLMAPIConfig.headers({
          ...baseArgs,
          fn: 'chatComplete',
        })
      ).toEqual({
        Authorization: 'Bearer test-api-key',
      });
    });

    it('resolves supported endpoints and returns empty string for unsupported ones', () => {
      expect(
        AbliteratedLLMAPIConfig.getEndpoint({
          ...baseArgs,
          fn: 'chatComplete',
        })
      ).toBe('/chat/completions');
      expect(
        AbliteratedLLMAPIConfig.getEndpoint({
          ...baseArgs,
          fn: 'complete',
        })
      ).toBe('/completions');
      expect(
        AbliteratedLLMAPIConfig.getEndpoint({
          ...baseArgs,
          fn: 'createModelResponse',
        })
      ).toBe('/responses');
      expect(
        AbliteratedLLMAPIConfig.getEndpoint({
          ...baseArgs,
          fn: 'embed',
        })
      ).toBe('');
    });
  });

  describe('parameter configurations', () => {
    it('uses glm-5.3-flash-abliterated as default model without mutating OpenAI config', () => {
      const chatComplete = AbliteratedLLMConfig.chatComplete as ProviderConfig;
      const modelConfig = chatComplete.model as ParameterConfig;

      expect(modelConfig).toMatchObject({
        param: 'model',
        required: true,
        default: 'glm-5.3-flash-abliterated',
      });
      expect(
        (OpenAIChatCompleteConfig.model as ParameterConfig).default
      ).not.toBe('glm-5.3-flash-abliterated');
    });

    it('supports all standard OpenAI chat completion parameters and maps developer role to system', () => {
      const chatComplete = AbliteratedLLMConfig.chatComplete as ProviderConfig;
      const expectedParams = [
        'model',
        'messages',
        'max_tokens',
        'max_completion_tokens',
        'temperature',
        'top_p',
        'stream',
        'stream_options',
        'stop',
        'tools',
        'tool_choice',
        'parallel_tool_calls',
        'response_format',
        'reasoning_effort',
        'service_tier',
        'prompt_cache_key',
        'seed',
        'user',
        'logprobs',
        'top_logprobs',
        'frequency_penalty',
        'presence_penalty',
      ];

      for (const param of expectedParams) {
        expect((chatComplete[param] as ParameterConfig)?.param).toBe(param);
      }

      const messagesConfig = chatComplete.messages as ParameterConfig;
      expect(messagesConfig.transform).toBeDefined();
      const transformedMessages = messagesConfig.transform?.(
        {
          messages: [
            { role: 'developer', content: 'Be concise.' },
            { role: 'user', content: 'Summarize' },
          ],
        },
        providerOptions
      );
      expect(transformedMessages).toEqual([
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: 'Summarize' },
      ]);
    });

    it('configures legacy completions parameters including stream_options', () => {
      const complete = AbliteratedLLMConfig.complete as ProviderConfig;
      expect(complete.model).toMatchObject({
        param: 'model',
        required: true,
        default: 'glm-5.3-flash-abliterated',
      });
      for (const param of [
        'prompt',
        'max_tokens',
        'temperature',
        'top_p',
        'stream',
        'stream_options',
        'stop',
        'seed',
        'user',
        'logprobs',
        'frequency_penalty',
        'presence_penalty',
      ]) {
        expect((complete[param] as ParameterConfig)?.param).toBe(param);
      }
    });

    it('configures Responses API (createModelResponse) parameters', () => {
      const createModelResponse =
        AbliteratedLLMConfig.createModelResponse as ProviderConfig;
      expect(createModelResponse.model).toMatchObject({
        param: 'model',
        required: true,
        default: 'glm-5.3-flash-abliterated',
      });
      for (const param of [
        'input',
        'instructions',
        'max_output_tokens',
        'reasoning',
        'service_tier',
        'prompt_cache_key',
        'tools',
        'tool_choice',
        'parallel_tool_calls',
        'stream',
        'stream_options',
        'temperature',
        'top_p',
        'text',
        'user',
      ]) {
        expect((createModelResponse[param] as ParameterConfig)?.param).toBe(
          param
        );
      }
    });
  });

  describe('responseTransforms', () => {
    it('passes streaming SSE chunks through verbatim by omitting stream overrides', () => {
      expect(
        AbliteratedLLMConfig.responseTransforms['stream-chatComplete']
      ).toBeUndefined();
      expect(
        AbliteratedLLMConfig.responseTransforms['stream-complete']
      ).toBeUndefined();
      expect(
        AbliteratedLLMConfig.responseTransforms['stream-createModelResponse']
      ).toBeUndefined();
    });

    it('preserves reasoning_content and attaches provider on chatComplete', () => {
      const rawResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1793664000,
        model: 'glm-5.3-flash-abliterated',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '4',
              reasoning_content: '2 + 2 = 4',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      const result = AbliteratedLLMConfig.responseTransforms.chatComplete(
        rawResponse,
        200
      );

      expect(result.provider).toBe(ABLITERATEDLLM);
      expect(result.choices[0].message.reasoning_content).toBe('2 + 2 = 4');
      expect(result.choices[0].message.content).toBe('4');
    });

    it('normalizes error responses on chatComplete and createModelResponse', () => {
      const errorPayload = {
        error: {
          message: 'Invalid API key',
          type: 'authentication_error',
          param: null,
          code: 'invalid_api_key',
        },
      };

      const chatError = AbliteratedLLMConfig.responseTransforms.chatComplete(
        errorPayload,
        401
      );
      expect(chatError).toEqual({
        error: {
          message: 'Invalid API key',
          type: 'authentication_error',
          param: null,
          code: 'invalid_api_key',
        },
        provider: ABLITERATEDLLM,
      });

      const responseError =
        AbliteratedLLMConfig.responseTransforms.createModelResponse(
          errorPayload,
          401
        );
      expect(responseError).toEqual({
        error: {
          message: 'Invalid API key',
          type: 'authentication_error',
          param: null,
          code: 'invalid_api_key',
        },
        provider: ABLITERATEDLLM,
      });
    });

    it('attaches provider on complete and createModelResponse success responses', () => {
      const completeResult = AbliteratedLLMConfig.responseTransforms.complete(
        {
          id: 'cmpl-123',
          object: 'text_completion',
          created: 1793664000,
          model: 'glm-5.3-flash-abliterated',
          choices: [
            {
              text: 'hello',
              index: 0,
              logprobs: null,
              finish_reason: 'stop',
            },
          ],
        },
        200
      );
      expect(completeResult.provider).toBe(ABLITERATEDLLM);

      const modelResponseResult =
        AbliteratedLLMConfig.responseTransforms.createModelResponse(
          {
            id: 'resp-123',
            object: 'response',
            status: 'completed',
            model: 'glm-5.3-flash-abliterated',
            output: [],
          },
          200
        );
      expect(modelResponseResult.provider).toBe(ABLITERATEDLLM);
    });
  });
});
