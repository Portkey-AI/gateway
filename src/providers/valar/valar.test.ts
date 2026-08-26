import { VALAR, VALID_PROVIDERS } from '../../globals';
import { Options, Params } from '../../types/requestBody';
import { endpointStrings, ParameterConfig } from '../types';
import ValarAPIConfig, { VALAR_BASE_URL } from './api';
import { ValarChatCompleteConfig } from './chatComplete';
import ValarConfig from './index';
import {
  ValarMessagesConfig,
  ValarMessagesResponseTransform,
} from './messages';

const providerOptions: Options = { provider: VALAR, apiKey: 'vlr-test-key' };

const getEndpoint = (fn: endpointStrings, gatewayRequestURL: string) =>
  ValarAPIConfig.getEndpoint({
    c: {} as any,
    providerOptions,
    fn,
    gatewayRequestBodyJSON: {} as Params,
    gatewayRequestURL,
  });

const getHeaders = (options: Options = providerOptions, fn = 'chatComplete') =>
  ValarAPIConfig.headers({
    c: {} as any,
    providerOptions: options,
    fn,
    transformedRequestBody: {},
    transformedRequestUrl: '',
  }) as Record<string, string>;

const param = (config: Record<string, any>, key: string) =>
  config[key] as ParameterConfig;

describe('Valar provider registration', () => {
  it('is registered under the `valar` slug', () => {
    expect(VALID_PROVIDERS).toContain(VALAR);
  });

  it('declares the endpoints it serves', () => {
    ['chatComplete', 'createModelResponse', 'messages', 'createBatch'].forEach(
      (fn) => expect(ValarConfig[fn]).toBeDefined()
    );
  });
});

describe('Valar API config', () => {
  it('resolves the endpoints Valar serves', () => {
    expect(
      ValarAPIConfig.getBaseURL({
        providerOptions,
        c: {} as any,
        gatewayRequestURL: '',
      })
    ).toBe(VALAR_BASE_URL);
    expect(getEndpoint('chatComplete', 'http://x/v1/chat/completions')).toBe(
      '/chat/completions'
    );
    expect(getEndpoint('messages', 'http://x/v1/messages')).toBe('/messages');
    expect(
      getEndpoint('messagesCountTokens', 'http://x/v1/messages/count_tokens')
    ).toBe('/messages/count_tokens');
    // Path-carrying endpoints keep the incoming path, ids included.
    expect(getEndpoint('createModelResponse', 'http://x/v1/responses')).toBe(
      '/responses'
    );
    expect(
      getEndpoint('getModelResponse', 'http://x/v1/responses/resp_123')
    ).toBe('/responses/resp_123');
    expect(getEndpoint('retrieveBatch', 'http://x/v1/batches/batch_123')).toBe(
      '/batches/batch_123'
    );
    // Surfaces Valar does not serve resolve to nothing.
    expect(getEndpoint('embed', 'http://x/v1/embeddings')).toBe('');
  });

  it('authenticates with a bearer token', () => {
    expect(getHeaders().Authorization).toBe('Bearer vlr-test-key');
  });

  it('forwards the completion window only when one is set', () => {
    expect(getHeaders()['X-Valar-Completion-Window']).toBeUndefined();
    expect(
      getHeaders({ ...providerOptions, valarCompletionWindow: 'flex' })[
        'X-Valar-Completion-Window'
      ]
    ).toBe('flex');
  });
});

describe('Valar chat completions', () => {
  it('maps the deprecated max_tokens onto max_completion_tokens', () => {
    // Valar rejects `max_tokens`, so an OpenAI client that still sends it is
    // carried over to the modern field instead of failing.
    expect(param(ValarChatCompleteConfig, 'max_tokens').param).toBe(
      'max_completion_tokens'
    );
    expect(param(ValarChatCompleteConfig, 'max_completion_tokens').param).toBe(
      'max_completion_tokens'
    );
    // max_completion_tokens is applied last, so it wins when both are sent.
    const keys = Object.keys(ValarChatCompleteConfig);
    expect(keys.indexOf('max_completion_tokens')).toBeGreaterThan(
      keys.indexOf('max_tokens')
    );
  });

  it('drops the parameters Valar rejects', () => {
    [
      'frequency_penalty',
      'presence_penalty',
      'logit_bias',
      'logprobs',
      'top_logprobs',
      'seed',
      'stop',
      'store',
      'service_tier',
      'audio',
      'prediction',
      'web_search_options',
      'functions',
      'function_call',
    ].forEach((key) => expect(ValarChatCompleteConfig[key]).toBeUndefined());
  });

  it('keeps the parameters Valar serves', () => {
    [
      'messages',
      'tools',
      'tool_choice',
      'parallel_tool_calls',
      'response_format',
      'reasoning_effort',
      'stream',
      'stream_options',
      'metadata',
    ].forEach((key) => expect(ValarChatCompleteConfig[key]).toBeDefined());
  });

  it('clamps n to the single choice Valar returns', () => {
    expect(param(ValarChatCompleteConfig, 'n').max).toBe(1);
    expect(param(ValarChatCompleteConfig, 'n').default).toBe(1);
  });

  it('does not invent a default model', () => {
    expect(param(ValarChatCompleteConfig, 'model').required).toBe(true);
    expect(param(ValarChatCompleteConfig, 'model').default).toBeUndefined();
  });
});

describe('Valar messages', () => {
  it('accepts the Anthropic parameters Valar serves and drops the rest', () => {
    [
      'model',
      'messages',
      'max_tokens',
      'system',
      'thinking',
      'tools',
      'top_k',
      'stop_sequences',
      'output_config',
    ].forEach((key) => expect(ValarMessagesConfig[key]).toBeDefined());
    ['container', 'mcp_servers', 'service_tier'].forEach((key) =>
      expect(ValarMessagesConfig[key]).toBeUndefined()
    );
  });

  it('passes an Anthropic-shaped response through untouched', () => {
    const response = {
      id: 'msg_1',
      model: 'zai-org/GLM-5.2',
      content: [{ type: 'text', text: 'hello' }],
    } as any;

    expect(ValarMessagesResponseTransform(response, 200)).toBe(response);
  });

  it('reads errors out of the OpenAI envelope Valar returns', () => {
    const transformed = ValarMessagesResponseTransform(
      {
        error: {
          message: 'model not found',
          type: 'invalid_request_error',
          param: null,
          code: null,
        },
      } as any,
      404
    );

    expect(transformed).toEqual({
      error: {
        message: 'valar error: model not found',
        type: 'invalid_request_error',
        param: null,
        code: null,
      },
      provider: VALAR,
    });
  });
});
