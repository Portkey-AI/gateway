import { AI21 } from '../../globals';
import { Message, Params } from '../../types/requestBody';
import AI21APIConfig from './api';
import {
  AI21ChatCompleteResponseTransform,
  AI21ChatCompleteStreamChunkTransform,
} from './chatComplete';
import AI21Config from './index';

const providerOptions = { provider: AI21, apiKey: 'test-key' };

const chatConfig = AI21Config.chatComplete;

const messagesOf = (params: Params) =>
  chatConfig.messages.transform(params) as Message[];

describe('ai21 chat completions', () => {
  test('routes chat to the OpenAI-compatible endpoint and leaves legacy routes', () => {
    expect(AI21APIConfig.getBaseURL({} as any)).toBe(
      'https://api.ai21.com/studio/v1'
    );

    expect(
      AI21APIConfig.getEndpoint({
        fn: 'chatComplete',
        gatewayRequestBodyJSON: { model: 'jamba-large' },
      } as any)
    ).toBe('/chat/completions');

    expect(
      AI21APIConfig.getEndpoint({
        fn: 'complete',
        gatewayRequestBodyJSON: { model: 'j2-ultra' },
      } as any)
    ).toBe('/j2-ultra/complete');

    expect(
      AI21APIConfig.getEndpoint({
        fn: 'embed',
        gatewayRequestBodyJSON: {},
      } as any)
    ).toBe('/embed');

    expect(
      AI21APIConfig.headers({
        providerOptions,
      } as any)
    ).toEqual({ Authorization: 'Bearer test-key' });
  });

  test('maps chat params onto the Jamba request and drops unsupported ones', () => {
    expect(chatConfig.model).toMatchObject({
      param: 'model',
      required: true,
      default: 'jamba-large',
    });
    expect(chatConfig.max_tokens.param).toBe('max_tokens');
    expect(chatConfig.max_completion_tokens.param).toBe('max_tokens');
    expect(chatConfig.temperature).toMatchObject({ min: 0, max: 2 });
    expect(chatConfig.top_p.param).toBe('top_p');
    expect(chatConfig.stop.param).toBe('stop');
    expect(chatConfig.stream.param).toBe('stream');
    expect(chatConfig.n.param).toBe('n');
    expect(chatConfig.tools.param).toBe('tools');
    expect(chatConfig.tool_choice.param).toBe('tool_choice');
    expect(chatConfig.response_format.param).toBe('response_format');
    expect(chatConfig.documents.param).toBe('documents');

    const dropped = [
      'functions',
      'function_call',
      'presence_penalty',
      'frequency_penalty',
      'logit_bias',
      'logprobs',
      'top_logprobs',
      'user',
      'seed',
      'stream_options',
      'service_tier',
      'parallel_tool_calls',
      'reasoning_effort',
      'numResults',
      'maxTokens',
      'stopSequences',
      'system',
    ];
    for (const key of dropped) {
      expect(chatConfig[key]).toBeUndefined();
    }

    expect(
      messagesOf({
        messages: [
          { role: 'developer', content: 'be brief' },
          { role: 'user', content: 'hi' },
          {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'lookup', arguments: '{}' },
              },
            ],
          },
        ],
      })
    ).toEqual([
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'lookup', arguments: '{}' },
          },
        ],
      },
    ]);
  });

  test('keeps Jurassic text completions on the legacy parameter names', () => {
    expect(AI21Config.complete.prompt.param).toBe('prompt');
    expect(AI21Config.complete.max_tokens.param).toBe('maxTokens');
    expect(AI21Config.complete.stop.param).toBe('stopSequences');
    expect(AI21Config.embed.input.param).toBe('texts');
  });

  test('maps a non-streaming Jamba response onto a chat completion', () => {
    const result = AI21ChatCompleteResponseTransform(
      {
        id: 'chatcmpl-1',
        object: 'chat.completion',
        created: 1_720_000_000,
        model: 'jamba-large',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello',
              tool_calls: [{ id: 'call_1', type: 'function' }],
            },
            finish_reason: 'stop',
            logprobs: null,
          },
        ],
        usage: {
          prompt_tokens: 11,
          completion_tokens: 2,
          total_tokens: 13,
        },
      },
      200
    );

    expect(result).toEqual({
      id: 'chatcmpl-1',
      object: 'chat.completion',
      created: 1_720_000_000,
      model: 'jamba-large',
      provider: AI21,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'Hello',
            tool_calls: [{ id: 'call_1', type: 'function' }],
          },
          logprobs: null,
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 11,
        completion_tokens: 2,
        total_tokens: 13,
      },
    });
  });

  test('maps AI21 detail errors and OpenAI-shaped errors', () => {
    expect(
      AI21ChatCompleteResponseTransform(
        { detail: 'model not found' } as any,
        422
      )
    ).toEqual({
      error: {
        message: 'ai21 error: model not found',
        type: null,
        param: null,
        code: null,
      },
      provider: AI21,
    });

    expect(
      AI21ChatCompleteResponseTransform(
        {
          error: {
            message: 'invalid api key',
            type: 'authentication_error',
            param: null,
            code: '401',
          },
        } as any,
        401
      )
    ).toEqual({
      error: {
        message: 'ai21 error: invalid api key',
        type: 'authentication_error',
        param: null,
        code: '401',
      },
      provider: AI21,
    });
  });

  test('registers the streaming transformer', () => {
    expect(AI21Config.responseTransforms['stream-chatComplete']).toBe(
      AI21ChatCompleteStreamChunkTransform
    );
    expect(typeof AI21Config.chatComplete.stream).toBe('object');
    expect(AI21Config.chatComplete.logit_bias).toBeUndefined();
  });
});

describe('ai21 chat streaming', () => {
  const parse = (chunk: string) => {
    expect(chunk.endsWith('\n\n')).toBe(true);
    expect(chunk.startsWith('data: ')).toBe(true);
    return chunk.slice('data: '.length, -2);
  };

  test('passes the [DONE] sentinel through without parsing it', () => {
    expect(parse(AI21ChatCompleteStreamChunkTransform('data: [DONE]'))).toBe(
      '[DONE]'
    );
  });

  test('rewrites role, content, and terminal usage chunks', () => {
    const role = JSON.parse(
      parse(
        AI21ChatCompleteStreamChunkTransform(
          `data: ${JSON.stringify({
            id: 'chatcmpl-1',
            created: 1_720_000_000,
            model: 'jamba-large',
            choices: [
              {
                index: 0,
                delta: { role: 'assistant' },
                finish_reason: null,
              },
            ],
            usage: null,
          })}`
        )
      )
    );
    expect(role).toEqual({
      id: 'chatcmpl-1',
      object: 'chat.completion.chunk',
      created: 1_720_000_000,
      model: 'jamba-large',
      provider: AI21,
      choices: [
        {
          index: 0,
          delta: { role: 'assistant' },
          logprobs: null,
          finish_reason: null,
        },
      ],
    });
    expect(role.usage).toBeUndefined();

    const token = JSON.parse(
      parse(
        AI21ChatCompleteStreamChunkTransform(
          `data: ${JSON.stringify({
            id: 'chatcmpl-1',
            object: 'chat.completion.chunk',
            created: 1_720_000_000,
            model: 'jamba-large',
            choices: [
              {
                index: 0,
                delta: { content: 'Hello' },
                finish_reason: null,
                logprobs: null,
              },
            ],
            usage: null,
          })}`
        )
      )
    );
    expect(token.choices[0].delta).toEqual({ content: 'Hello' });
    expect(token.provider).toBe(AI21);
    expect(token.usage).toBeUndefined();

    const done = JSON.parse(
      parse(
        AI21ChatCompleteStreamChunkTransform(
          `data: ${JSON.stringify({
            id: 'chatcmpl-1',
            object: 'chat.completion.chunk',
            created: 1_720_000_000,
            model: 'jamba-large',
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: 'length',
              },
            ],
            usage: {
              prompt_tokens: 11,
              completion_tokens: 4,
              total_tokens: 15,
            },
          })}`
        )
      )
    );
    expect(done.choices[0].finish_reason).toBe('length');
    expect(done.usage).toEqual({
      prompt_tokens: 11,
      completion_tokens: 4,
      total_tokens: 15,
    });
  });

  test('keeps tool-call deltas and tolerates an empty choices array', () => {
    const toolCall = JSON.parse(
      parse(
        AI21ChatCompleteStreamChunkTransform(
          `data: ${JSON.stringify({
            id: 'chatcmpl-2',
            model: 'jamba-mini',
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_1',
                      type: 'function',
                      function: { name: 'lookup', arguments: '{}' },
                    },
                  ],
                },
                finish_reason: 'tool_calls',
              },
            ],
          })}`
        )
      )
    );
    expect(toolCall.choices[0].delta.tool_calls[0].function.name).toBe(
      'lookup'
    );
    expect(toolCall.choices[0].finish_reason).toBe('tool_calls');

    const empty = JSON.parse(
      parse(
        AI21ChatCompleteStreamChunkTransform(
          'data: {"id":"chatcmpl-3","choices":[]}'
        )
      )
    );
    expect(empty.choices).toEqual([]);
    expect(empty.provider).toBe(AI21);
  });
});
