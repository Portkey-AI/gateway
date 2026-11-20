import { readFileSync } from 'fs';
import { join } from 'path';
import { Context } from 'hono';
import { SARVAM, VALID_PROVIDERS } from '../../globals';
import providersData from '../../data/providers.json';
import { transformToProviderRequest } from '../../services/transformToProviderRequest';
import { Options, Params } from '../../types/requestBody';
import SarvamConfig from '.';
import SarvamAPIConfig from './api';
import { SarvamChatCompleteStreamChunkTransform } from './chatComplete';

// Load only the Sarvam provider instead of the full registry, so the test does
// not depend on unrelated providers.
jest.mock('..', () => ({
  __esModule: true,
  default: { sarvam: jest.requireActual('./index').default },
}));

const c = {} as Context;
const providerOptions = { provider: SARVAM, apiKey: 'sk-test' } as Options;

const getEndpoint = (fn: any) =>
  SarvamAPIConfig.getEndpoint({
    c,
    providerOptions,
    fn,
    gatewayRequestBodyJSON: {},
    gatewayRequestURL: '',
  });

describe('Sarvam provider registration', () => {
  test('is a valid provider', () => {
    expect(SARVAM).toBe('sarvam');
    expect(VALID_PROVIDERS).toContain(SARVAM);
  });

  test('is registered in the provider registry', () => {
    const registry = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8');
    expect(registry).toContain("import SarvamConfig from './sarvam';");
    expect(registry).toMatch(/^\s*sarvam: SarvamConfig,$/m);
  });

  test('is listed in providers.json with the v2 base URL', () => {
    const entry = (providersData as any).data.find(
      (p: { id: string }) => p.id === SARVAM
    );
    expect(entry).toMatchObject({
      id: 'sarvam',
      name: 'Sarvam AI',
      object: 'provider',
      base_url: 'https://api.sarvam.ai/v2',
    });
  });
});

describe('Sarvam API config', () => {
  test('uses the v2 base URL by default', async () => {
    expect(
      await SarvamAPIConfig.getBaseURL({
        providerOptions,
        c,
        gatewayRequestURL: '',
      })
    ).toBe('https://api.sarvam.ai/v2');
  });

  test('respects a custom host', async () => {
    expect(
      await SarvamAPIConfig.getBaseURL({
        providerOptions: {
          ...providerOptions,
          customHost: 'https://x.test/v2',
        },
        c,
        gatewayRequestURL: '',
      })
    ).toBe('https://x.test/v2');
  });

  test('sends the API key as a bearer token', async () => {
    expect(
      await SarvamAPIConfig.headers({
        c,
        providerOptions,
        fn: 'chatComplete',
        transformedRequestBody: {},
        transformedRequestUrl: '',
      })
    ).toEqual({ Authorization: 'Bearer sk-test' });
  });

  test('maps supported endpoints', () => {
    expect(getEndpoint('chatComplete')).toBe('/chat/completions');
    expect(getEndpoint('createModelResponse')).toBe('/responses');
  });

  test('returns no path for unsupported endpoints', () => {
    for (const fn of [
      'complete',
      'embed',
      'getModelResponse',
      'deleteModelResponse',
      'listResponseInputItems',
    ]) {
      expect(getEndpoint(fn)).toBe('');
    }
  });
});

describe('Sarvam request transforms', () => {
  test('chat completions default the model to sarvam-105b', () => {
    const body = transformToProviderRequest(
      SARVAM,
      { messages: [{ role: 'user', content: 'hi' }] } as Params,
      {} as Params,
      'chatComplete',
      {},
      providerOptions
    ) as Record<string, any>;
    expect(body.model).toBe('sarvam-105b');
    expect(body.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  test('chat completions pass through OpenAI parameters', () => {
    const tools = [
      {
        type: 'function',
        function: { name: 'getWeather', parameters: { type: 'object' } },
      },
    ];
    const body = transformToProviderRequest(
      SARVAM,
      {
        model: 'sarvam-105b',
        messages: [{ role: 'user', content: 'hi' }],
        stream: true,
        stream_options: { include_usage: true },
        reasoning_effort: 'high',
        tools,
        tool_choice: 'auto',
        temperature: 0.5,
        max_tokens: 100,
      } as Params,
      {} as Params,
      'chatComplete',
      {},
      providerOptions
    ) as Record<string, any>;
    expect(body).toMatchObject({
      model: 'sarvam-105b',
      stream: true,
      stream_options: { include_usage: true },
      reasoning_effort: 'high',
      tools,
      tool_choice: 'auto',
      temperature: 0.5,
      max_tokens: 100,
    });
  });

  test('responses requests pass through to the Responses API', () => {
    const body = transformToProviderRequest(
      SARVAM,
      {
        model: 'sarvam-105b',
        input: 'hi',
        instructions: 'Be brief.',
        stream: true,
      } as Params,
      {} as Params,
      'createModelResponse',
      {},
      providerOptions
    ) as Record<string, any>;
    expect(body).toMatchObject({
      model: 'sarvam-105b',
      input: 'hi',
      instructions: 'Be brief.',
      stream: true,
    });
  });
});

describe('Sarvam response transforms', () => {
  const transforms = SarvamConfig.responseTransforms!;

  test('chat completion responses are tagged with the provider', () => {
    const res = (transforms.chatComplete as any)(
      { id: 'c1', object: 'chat.completion', choices: [] },
      200
    );
    expect(res.provider).toBe(SARVAM);
  });

  test('chat completion errors are normalised', () => {
    const res = (transforms.chatComplete as any)(
      {
        error: {
          message: 'Invalid or missing authentication credentials',
          code: 'invalid_api_key_error',
        },
      },
      403
    );
    expect(res).toMatchObject({
      error: {
        message: 'sarvam error: Invalid or missing authentication credentials',
        code: 'invalid_api_key_error',
      },
      provider: SARVAM,
    });
  });

  test('responses API results are tagged with the provider', () => {
    const res = (transforms.createModelResponse as any)(
      { id: 'resp_1', object: 'response', output: [] },
      200
    );
    expect(res.provider).toBe(SARVAM);
  });

  test('responses API errors are normalised', () => {
    const res = (transforms.createModelResponse as any)(
      {
        error: {
          message: "'store' is not supported",
          code: 'invalid_request_error',
        },
      },
      400
    );
    expect(res).toMatchObject({
      error: { message: "sarvam error: 'store' is not supported" },
      provider: SARVAM,
    });
  });
});

describe('Sarvam stream chunk transform', () => {
  test('tags each chunk with the provider', () => {
    const chunk = {
      id: 'c1',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'sarvam-105b',
      choices: [{ index: 0, delta: { content: 'hi' }, finish_reason: null }],
    };
    const out = SarvamChatCompleteStreamChunkTransform(
      `data: ${JSON.stringify(chunk)}`
    );
    expect(out.endsWith('\n\n')).toBe(true);
    expect(JSON.parse(out.slice(6))).toEqual({ ...chunk, provider: SARVAM });
  });

  test('keeps the final usage-only chunk', () => {
    const chunk = { id: 'c1', choices: [], usage: { total_tokens: 3 } };
    const out = SarvamChatCompleteStreamChunkTransform(
      `data: ${JSON.stringify(chunk)}`
    );
    expect(JSON.parse(out.slice(6))).toMatchObject({
      usage: { total_tokens: 3 },
      provider: SARVAM,
    });
  });

  test('passes [DONE] through and drops empty chunks', () => {
    expect(SarvamChatCompleteStreamChunkTransform('data: [DONE]')).toBe(
      'data: [DONE]\n\n'
    );
    expect(SarvamChatCompleteStreamChunkTransform('')).toBe('');
    expect(SarvamChatCompleteStreamChunkTransform('data: ')).toBe('');
  });
});
