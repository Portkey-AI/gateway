import { TRITON } from '../../globals';
import { Options } from '../../types/requestBody';
import TritonAPIConfig from './api';
import TritonConfig from './index';

const providerOptions = {
  provider: TRITON,
  customHost: 'http://triton.internal:9000',
} as Options;

const endpointArgs = {
  c: {} as any,
  providerOptions,
  gatewayRequestBodyJSON: {},
  gatewayRequestURL: '',
};

describe('triton embeddings', () => {
  test('routes embed to the OpenAI-compatible embeddings endpoint', () => {
    expect(
      TritonAPIConfig.getBaseURL({
        providerOptions,
        fn: 'embed',
        c: {} as any,
        gatewayRequestURL: '',
      })
    ).toBe('http://triton.internal:9000');
    expect(TritonAPIConfig.getEndpoint({ ...endpointArgs, fn: 'embed' })).toBe(
      '/v1/embeddings'
    );
  });

  test('maps embedding params and normalizes a successful response', () => {
    expect(TritonConfig.embed).toBeDefined();
    expect(TritonConfig.embed.model).toMatchObject({
      param: 'model',
      required: true,
    });
    expect(TritonConfig.embed.input).toMatchObject({
      param: 'input',
      required: true,
    });
    expect(TritonConfig.embed.encoding_format.param).toBe('encoding_format');
    expect(TritonConfig.embed.dimensions.param).toBe('dimensions');
    expect(TritonConfig.embed.user.param).toBe('user');

    const result = TritonConfig.responseTransforms.embed(
      {
        object: 'list',
        data: [
          { object: 'embedding', embedding: [0.1, 0.2], index: 0 },
          { object: 'embedding', embedding: [0.3], index: 1 },
        ],
        model: 'BAAI/bge-large-en-v1.5',
        usage: { prompt_tokens: 4, total_tokens: 4 },
      },
      200
    );

    expect(result).toEqual({
      object: 'list',
      data: [
        { object: 'embedding', embedding: [0.1, 0.2], index: 0 },
        { object: 'embedding', embedding: [0.3], index: 1 },
      ],
      model: 'BAAI/bge-large-en-v1.5',
      usage: { prompt_tokens: 4, total_tokens: 4 },
      provider: TRITON,
    });
  });

  test('reports an OpenAI-style embeddings error from Triton', () => {
    const result = TritonConfig.responseTransforms.embed(
      {
        error: {
          message: 'model not found',
          type: 'invalid_request_error',
          param: 'model',
          code: 'model_not_found',
        },
      },
      404
    );

    expect(result).toEqual({
      error: {
        message: 'triton error: model not found',
        type: 'invalid_request_error',
        param: 'model',
        code: 'model_not_found',
      },
      provider: TRITON,
    });
  });

  test('reports a FastAPI validation error from the embeddings endpoint', () => {
    const result = TritonConfig.responseTransforms.embed(
      {
        detail: [
          {
            loc: ['body', 'input'],
            msg: 'field required',
            type: 'value_error.missing',
          },
        ],
      },
      422
    );

    expect(result.error.message).toBe(
      'triton error: body.input: field required'
    );
    expect(result.error.type).toBe('value_error.missing');
    expect(result.provider).toBe(TRITON);
  });

  test('rejects an embeddings body that is neither data nor an error', () => {
    const result = TritonConfig.responseTransforms.embed({ ok: false }, 200);
    expect(result.error.message).toContain(
      'Invalid response received from triton'
    );
    expect(result.provider).toBe(TRITON);
  });
});

describe('triton chat completions', () => {
  test('routes chat completions to /v1/chat/completions', () => {
    expect(
      TritonAPIConfig.getEndpoint({ ...endpointArgs, fn: 'chatComplete' })
    ).toBe('/v1/chat/completions');
  });

  test('maps chat params, including the developer role, onto Triton fields', () => {
    expect(TritonConfig.chatComplete).toBeDefined();
    expect(TritonConfig.chatComplete.model).toMatchObject({
      param: 'model',
      required: true,
    });
    expect(TritonConfig.chatComplete.temperature).toMatchObject({
      param: 'temperature',
      min: 0,
      max: 2,
    });
    expect(TritonConfig.chatComplete.top_p).toMatchObject({
      param: 'top_p',
      min: 0,
      max: 1,
    });
    expect(TritonConfig.chatComplete.max_tokens.param).toBe('max_tokens');
    expect(TritonConfig.chatComplete.max_completion_tokens.param).toBe(
      'max_completion_tokens'
    );
    expect(TritonConfig.chatComplete.stream.param).toBe('stream');
    expect(TritonConfig.chatComplete.tools.param).toBe('tools');
    expect(TritonConfig.chatComplete).not.toHaveProperty('service_tier');
    expect(TritonConfig.chatComplete).not.toHaveProperty('store');
    expect(TritonConfig.chatComplete).not.toHaveProperty('reasoning_effort');

    expect(
      TritonConfig.chatComplete.messages.transform({
        messages: [
          { role: 'developer', content: 'be brief' },
          { role: 'user', content: 'hi' },
        ],
      })
    ).toEqual([
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'hi' },
    ]);
  });

  test('normalizes a chat completion and stamps the provider', () => {
    const result = TritonConfig.responseTransforms.chatComplete(
      {
        id: 'chatcmpl-1',
        object: 'chat.completion',
        created: 1710000000,
        model: 'llama-3.1-8b-instruct',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'hello',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'lookup', arguments: '{}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 8,
          completion_tokens: 2,
          total_tokens: 10,
        },
      },
      200
    );

    expect(result).toEqual({
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: 1710000000,
      model: 'llama-3.1-8b-instruct',
      provider: TRITON,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'hello',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'lookup', arguments: '{}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: {
        prompt_tokens: 8,
        completion_tokens: 2,
        total_tokens: 10,
      },
    });
  });

  test('reports a chat error body', () => {
    const result = TritonConfig.responseTransforms.chatComplete(
      {
        detail: 'No attached inference engine',
      },
      500
    );

    expect(result.error.message).toBe(
      'triton error: No attached inference engine'
    );
    expect(result.provider).toBe(TRITON);
  });

  test('stamps the provider on a streamed chat chunk and keeps the done sentinel', () => {
    const transformChunk =
      TritonConfig.responseTransforms['stream-chatComplete'];
    expect(transformChunk).toEqual(expect.any(Function));

    const chunk = transformChunk(
      `data: ${JSON.stringify({
        id: 'chatcmpl-1',
        object: 'chat.completion.chunk',
        created: 1710000000,
        model: 'llama-3.1-8b-instruct',
        choices: [
          {
            index: 0,
            delta: { content: 'he' },
            finish_reason: null,
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })}`
    );

    expect(JSON.parse(chunk.replace(/^data: /, '').trim())).toEqual({
      id: 'chatcmpl-1',
      object: 'chat.completion.chunk',
      created: 1710000000,
      model: 'llama-3.1-8b-instruct',
      provider: TRITON,
      choices: [
        {
          index: 0,
          delta: { content: 'he' },
          finish_reason: null,
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
    expect(transformChunk('data: [DONE]')).toBe('data: [DONE]\n\n');
  });

  test('rejects a chat body that is neither choices nor an error', () => {
    const result = TritonConfig.responseTransforms.chatComplete(
      { unexpected: true },
      200
    );
    expect(result.error.message).toContain(
      'Invalid response received from triton'
    );
    expect(result.provider).toBe(TRITON);
  });
});

describe('triton completions', () => {
  test('still routes the native generate endpoint', () => {
    expect(
      TritonAPIConfig.getEndpoint({ ...endpointArgs, fn: 'complete' })
    ).toBe('/generate');
    expect(TritonConfig.complete).toBeDefined();
    expect(TritonConfig.responseTransforms.complete).toEqual(
      expect.any(Function)
    );
  });
});
