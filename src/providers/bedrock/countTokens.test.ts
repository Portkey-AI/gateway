// env.ts uses top-level await, which ts-jest's CommonJS output can't load.
jest.mock('../../utils/env', () => ({
  Environment: () => ({}),
  getValueOrFileContents: (value?: string) => value,
}));

import BedrockAPIConfig from './api';
import BedrockConfig from './index';
import {
  BedrockAnthropicMessageCountTokensConfig,
  BedrockConverseMessageCountTokensResponseTransform,
  BedrockMantleMessagesCountTokensConfig,
} from './countTokens';
import { shouldCountTokensOnBedrockMantle } from './utils';
import { transformUsingProviderConfig } from '../../services/transformToProviderRequest';

const c: any = { get: () => undefined, env: {} };
const fn = 'messagesCountTokens';

const options = (overrides: Record<string, any> = {}) =>
  ({
    provider: 'bedrock',
    awsRegion: 'eu-west-1',
    awsAccessKeyId: 'AKIDEXAMPLE',
    awsSecretAccessKey: 'secret',
    ...overrides,
  }) as any;

const countRequest = (model: string, extra: Record<string, any> = {}) =>
  ({
    model,
    messages: [{ role: 'user', content: 'hello' }],
    system: 'be brief',
    tools: [{ name: 'Bash', input_schema: { type: 'object' } }],
    ...extra,
  }) as any;

const fullURL = async (params: any, providerOptions: any) => {
  const baseURL = await BedrockAPIConfig.getBaseURL({
    c,
    providerOptions,
    fn,
    gatewayRequestURL: 'https://gateway/v1/messages/count_tokens',
    params,
  });
  const endpoint = BedrockAPIConfig.getEndpoint({
    c,
    providerOptions,
    fn,
    gatewayRequestURL: 'https://gateway/v1/messages/count_tokens',
    gatewayRequestBodyJSON: params,
    gatewayRequestBody: {},
  });
  return `${baseURL}${endpoint}`;
};

describe('shouldCountTokensOnBedrockMantle', () => {
  it.each([
    'eu.anthropic.claude-opus-5-5',
    'global.anthropic.claude-sonnet-5',
    'anthropic.claude-opus-4-7',
    'us.anthropic.claude-haiku-5-5',
  ])('uses bedrock-mantle for %s', (model) => {
    expect(shouldCountTokensOnBedrockMantle(c, options(), model)).toBe(true);
  });

  it.each([
    'eu.anthropic.claude-opus-4-6-v1',
    'anthropic.claude-sonnet-4-6',
    'anthropic.claude-sonnet-4-5-20250929-v1:0',
    'anthropic.claude-haiku-4-5-20251001-v1:0',
    'anthropic.claude-opus-4-5-20251101-v1:0',
    'anthropic.claude-sonnet-4-20250514-v1:0',
    'anthropic.claude-3-5-haiku-20241022-v1:0',
    'amazon.nova-pro-v1:0',
  ])('keeps bedrock-runtime for %s', (model) => {
    expect(shouldCountTokensOnBedrockMantle(c, options(), model)).toBe(false);
  });

  it('uses the resolved foundation model of an inference profile ARN', () => {
    expect(
      shouldCountTokensOnBedrockMantle(
        c,
        options({ foundationModel: 'anthropic.claude-opus-5-5' }),
        'arn:aws:bedrock:eu-west-1:123456789012:application-inference-profile/abc'
      )
    ).toBe(true);
  });

  it('keeps bedrock-runtime with a custom host', () => {
    expect(
      shouldCountTokensOnBedrockMantle(
        c,
        options({ customHost: 'https://vpce.example' }),
        'anthropic.claude-opus-5-5'
      )
    ).toBe(false);
  });

  it.each(['cn-north-1', 'us-gov-west-1'])(
    'keeps bedrock-runtime in %s',
    (awsRegion) => {
      expect(
        shouldCountTokensOnBedrockMantle(
          c,
          options({ awsRegion }),
          'anthropic.claude-opus-5-5'
        )
      ).toBe(false);
    }
  );
});

describe('Bedrock count tokens routing', () => {
  it('sends newer Claude models to the bedrock-mantle endpoint', async () => {
    const providerOptions = options();
    const params = countRequest('eu.anthropic.claude-opus-5-5');

    const url = await fullURL(params, providerOptions);
    expect(url).toBe(
      'https://bedrock-mantle.eu-west-1.api.aws/anthropic/v1/messages/count_tokens'
    );

    const config = BedrockConfig.getConfig({ params, providerOptions });
    expect(config.messagesCountTokens).toBe(
      BedrockMantleMessagesCountTokensConfig
    );
    const body = transformUsingProviderConfig(
      config.messagesCountTokens,
      params,
      providerOptions
    );
    expect(body).toEqual({
      model: 'anthropic.claude-opus-5-5',
      messages: params.messages,
      system: params.system,
      tools: params.tools,
    });

    const headers = await BedrockAPIConfig.headers({
      c,
      fn,
      providerOptions,
      transformedRequestBody: body,
      transformedRequestUrl: url,
    });
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['authorization']).toContain(
      '/eu-west-1/bedrock-mantle/aws4_request'
    );
  });

  it('forwards the anthropic-beta header to bedrock-mantle and signs it', async () => {
    const providerOptions = options({
      anthropicBeta: 'context-management-2025-06-27',
    });
    const url = await fullURL(
      countRequest('anthropic.claude-opus-5-5'),
      providerOptions
    );
    const headers = await BedrockAPIConfig.headers({
      c,
      fn,
      providerOptions,
      transformedRequestBody: {},
      transformedRequestUrl: url,
    });
    expect(headers['anthropic-beta']).toBe('context-management-2025-06-27');
    expect(headers['authorization']).toContain('anthropic-beta');
  });

  it('ignores a mantle flag when a custom host is set', async () => {
    // getBaseURL is skipped with a custom host, so the flag could only come
    // from caller-supplied provider options.
    const providerOptions = options({
      customHost: 'https://vpce.example',
      bedrockCountTokensOnMantle: true,
    });
    const params = countRequest('anthropic.claude-opus-5-5');
    const endpoint = BedrockAPIConfig.getEndpoint({
      c,
      providerOptions,
      fn,
      gatewayRequestURL: 'https://gateway/v1/messages/count_tokens',
      gatewayRequestBodyJSON: params,
      gatewayRequestBody: {},
    });
    expect(endpoint).toBe('/model/anthropic.claude-opus-5-5/count-tokens');
    expect(
      BedrockConfig.getConfig({ params, providerOptions }).messagesCountTokens
    ).toBe(BedrockAnthropicMessageCountTokensConfig);
    const headers = await BedrockAPIConfig.headers({
      c,
      fn,
      providerOptions,
      transformedRequestBody: {},
      transformedRequestUrl: `https://vpce.example${endpoint}`,
    });
    expect(headers['authorization']).toContain('/bedrock/aws4_request');
  });

  it('drops fields the count_tokens API rejects', () => {
    const body = transformUsingProviderConfig(
      BedrockMantleMessagesCountTokensConfig,
      countRequest('anthropic.claude-opus-5-5', {
        max_tokens: 1024,
        stream: true,
        temperature: 0.2,
        metadata: { user_id: 'u' },
        stop_sequences: ['x'],
        thinking: { type: 'adaptive' },
      }),
      options()
    );
    expect(Object.keys(body).sort()).toEqual(
      ['messages', 'model', 'system', 'thinking', 'tools'].sort()
    );
  });

  it('uses x-api-key on bedrock-mantle with a Bedrock API key', async () => {
    const providerOptions = options({
      awsAuthType: 'apiKey',
      apiKey: 'bedrock-api-key',
    });
    const url = await fullURL(
      countRequest('anthropic.claude-opus-5-5'),
      providerOptions
    );
    const headers = await BedrockAPIConfig.headers({
      c,
      fn,
      providerOptions,
      transformedRequestBody: {},
      transformedRequestUrl: url,
    });
    expect(headers['x-api-key']).toBe('bedrock-api-key');
    expect(headers['Authorization']).toBeUndefined();
  });

  it('keeps older Claude models on bedrock-runtime', async () => {
    const providerOptions = options();
    const params = countRequest('eu.anthropic.claude-opus-4-6-v1');

    const url = await fullURL(params, providerOptions);
    expect(url).toBe(
      'https://bedrock-runtime.eu-west-1.amazonaws.com/model/anthropic.claude-opus-4-6-v1/count-tokens'
    );
    expect(
      BedrockConfig.getConfig({ params, providerOptions }).messagesCountTokens
    ).toBe(BedrockAnthropicMessageCountTokensConfig);

    const headers = await BedrockAPIConfig.headers({
      c,
      fn,
      providerOptions,
      transformedRequestBody: {},
      transformedRequestUrl: url,
    });
    expect(headers['anthropic-version']).toBeUndefined();
    expect(headers['authorization']).toContain(
      '/eu-west-1/bedrock/aws4_request'
    );
  });

  it('does not change other endpoints', async () => {
    const providerOptions = options();
    const baseURL = await BedrockAPIConfig.getBaseURL({
      c,
      providerOptions,
      fn: 'messages',
      gatewayRequestURL: 'https://gateway/v1/messages',
      params: countRequest('eu.anthropic.claude-opus-5-5'),
    });
    expect(baseURL).toBe('https://bedrock-runtime.eu-west-1.amazonaws.com');
  });
});

describe('BedrockConverseMessageCountTokensResponseTransform', () => {
  it('maps the bedrock-runtime response', () => {
    expect(
      BedrockConverseMessageCountTokensResponseTransform(
        { inputTokens: 5 },
        200
      )
    ).toEqual({ input_tokens: 5 });
  });

  it('maps the bedrock-mantle response', () => {
    expect(
      BedrockConverseMessageCountTokensResponseTransform(
        { input_tokens: 9 },
        200
      )
    ).toEqual({ input_tokens: 9 });
  });

  it('maps a bedrock-mantle Anthropic-shaped error', () => {
    const result: any = BedrockConverseMessageCountTokensResponseTransform(
      {
        type: 'error',
        request_id: 'req',
        error: { type: 'invalid_request_error', message: 'bad tools' },
      },
      400
    );
    expect(result.error.message).toBe('bedrock error: bad tools');
    expect(result.error.type).toBe('invalid_request_error');
    expect(result.provider).toBe('bedrock');
  });

  it.each([{ message: 'not authorized' }, { Message: 'not authorized' }])(
    'maps an AWS-shaped error %p',
    (body) => {
      const result: any = BedrockConverseMessageCountTokensResponseTransform(
        body,
        403
      );
      expect(result.error.message).toBe('bedrock error: not authorized');
      expect(result.provider).toBe('bedrock');
    }
  );
});
