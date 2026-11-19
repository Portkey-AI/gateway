import { Context } from 'hono';
import { ABLITERATEDLLM, VALID_PROVIDERS } from '../../globals';
import Providers from '../index';
import { OpenAIChatCompleteConfig } from '../openai/chatComplete';
import { ParameterConfig, ProviderConfig } from '../types';
import { transformUsingProviderConfig } from '../../services/transformToProviderRequest';
import { Options, Params } from '../../types/requestBody';
import AbliteratedLLMAPIConfig from './api';
import AbliteratedLLMConfig from './index';

describe('AbliteratedLLM provider', () => {
  const providerOptions: Options = {
    provider: ABLITERATEDLLM,
    apiKey: 'test-api-key',
  };

  describe('registration', () => {
    it('exports ABLITERATEDLLM constant and registers in VALID_PROVIDERS', () => {
      expect(ABLITERATEDLLM).toBe('abliteratedllm');
      expect(VALID_PROVIDERS).toContain(ABLITERATEDLLM);
    });

    it('registers AbliteratedLLMConfig in Providers map', () => {
      expect(Providers[ABLITERATEDLLM]).toBe(AbliteratedLLMConfig);
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

  describe('request parameter transformations', () => {
    it('uses glm-5.3-flash-abliterated as default model without mutating OpenAI config', () => {
      const transformed = transformUsingProviderConfig(
        AbliteratedLLMConfig.chatComplete as ProviderConfig,
        {
          messages: [{ role: 'user', content: 'Hello' }],
        },
        providerOptions
      );

      expect(transformed.model).toBe('glm-5.3-flash-abliterated');
      expect(
        (OpenAIChatCompleteConfig.model as ParameterConfig).default
      ).not.toBe('glm-5.3-flash-abliterated');
    });

    it('transforms standard OpenAI chat completion parameters and maps developer role to system', () => {
      const params = {
        model: 'glm-5.3-cyber-abliterated',
        messages: [
          { role: 'developer', content: 'Be concise.' },
          { role: 'user', content: 'Summarize' },
        ],
        max_tokens: 512,
        max_completion_tokens: 1024,
        temperature: 0.7,
        top_p: 0.9,
        stream: true,
        stream_options: { include_usage: true },
        stop: ['END'],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_status',
              parameters: { type: 'object', properties: {} },
            },
          },
        ],
        tool_choice: 'auto',
        parallel_tool_calls: true,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'summary',
            strict: true,
            schema: { type: 'object', properties: {} },
          },
        },
        reasoning_effort: 'high',
        service_tier: 'priority',
        prompt_cache_key: 'cache-key-1',
        seed: 42,
        user: 'user-123',
        logprobs: true,
        top_logprobs: 2,
        frequency_penalty: 0.1,
        presence_penalty: 0.2,
      } as unknown as Params;

      const transformed = transformUsingProviderConfig(
        AbliteratedLLMConfig.chatComplete as ProviderConfig,
        params,
        providerOptions
      );

      expect(transformed).toMatchObject({
        model: 'glm-5.3-cyber-abliterated',
        messages: [
          { role: 'system', content: 'Be concise.' },
          { role: 'user', content: 'Summarize' },
        ],
        max_tokens: 512,
        max_completion_tokens: 1024,
        temperature: 0.7,
        top_p: 0.9,
        stream: true,
        stream_options: { include_usage: true },
        stop: ['END'],
        tool_choice: 'auto',
        parallel_tool_calls: true,
        reasoning_effort: 'high',
        service_tier: 'priority',
        prompt_cache_key: 'cache-key-1',
        seed: 42,
        user: 'user-123',
        logprobs: true,
        top_logprobs: 2,
        frequency_penalty: 0.1,
        presence_penalty: 0.2,
      });
      expect(transformed.tools).toHaveLength(1);
      expect(transformed.response_format).toEqual(params.response_format);
    });

    it('transforms legacy completions parameters', () => {
      const transformed = transformUsingProviderConfig(
        AbliteratedLLMConfig.complete as ProviderConfig,
        {
          prompt: 'Once upon a time',
          max_tokens: 64,
          stream: true,
          stream_options: { include_usage: true },
        } as unknown as Params,
        providerOptions
      );

      expect(transformed).toMatchObject({
        model: 'glm-5.3-flash-abliterated',
        prompt: 'Once upon a time',
        max_tokens: 64,
        stream: true,
        stream_options: { include_usage: true },
      });
    });

    it('transforms Responses API (createModelResponse) parameters', () => {
      const transformed = transformUsingProviderConfig(
        AbliteratedLLMConfig.createModelResponse as ProviderConfig,
        {
          input: 'Explain TCP congestion control.',
          instructions: 'Be brief.',
          max_output_tokens: 256,
          reasoning: { effort: 'low' },
          service_tier: 'default',
          prompt_cache_key: 'resp-key-1',
          stream: false,
        } as unknown as Params,
        providerOptions
      );

      expect(transformed).toMatchObject({
        model: 'glm-5.3-flash-abliterated',
        input: 'Explain TCP congestion control.',
        instructions: 'Be brief.',
        max_output_tokens: 256,
        reasoning: { effort: 'low' },
        service_tier: 'default',
        prompt_cache_key: 'resp-key-1',
        stream: false,
      });
    });
  });

  describe('responseTransforms', () => {
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
