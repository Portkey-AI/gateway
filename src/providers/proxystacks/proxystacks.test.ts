import { PROXYSTACKS, VALID_PROVIDERS } from '../../globals';
import ProxyStacksAPIConfig, { DEFAULT_PROXYSTACKS_BASE_URL } from './api';
import { ProxyStacksChatCompleteStreamChunkTransform } from './chatComplete';
import ProxyStacksConfig from './index';

describe('ProxyStacks Relay provider configuration', () => {
  it('registers proxystacks in globals and exposes complete config', () => {
    expect(PROXYSTACKS).toBe('proxystacks');
    expect(VALID_PROVIDERS).toContain(PROXYSTACKS);
    expect(ProxyStacksConfig.api).toBe(ProxyStacksAPIConfig);
    expect(ProxyStacksConfig.chatComplete).toBeDefined();
    expect(ProxyStacksConfig.embed).toBeDefined();
  });

  it('resolves base URL, auth headers, and endpoints', () => {
    const dummyContext = {} as any;
    expect(ProxyStacksAPIConfig.getBaseURL(dummyContext)).toBe(
      DEFAULT_PROXYSTACKS_BASE_URL
    );
    expect(DEFAULT_PROXYSTACKS_BASE_URL).toBe('https://proxystacks.com/v1');

    const headers = ProxyStacksAPIConfig.headers({
      ...dummyContext,
      providerOptions: { apiKey: 'sk-relay-test' },
    });
    expect(headers).toEqual({
      Authorization: 'Bearer sk-relay-test',
    });

    expect(
      ProxyStacksAPIConfig.getEndpoint({
        ...dummyContext,
        fn: 'chatComplete',
      })
    ).toBe('/chat/completions');
    expect(
      ProxyStacksAPIConfig.getEndpoint({
        ...dummyContext,
        fn: 'stream-chatComplete',
      })
    ).toBe('/chat/completions');
    expect(
      ProxyStacksAPIConfig.getEndpoint({
        ...dummyContext,
        fn: 'embed',
      })
    ).toBe('/embeddings');
    expect(
      ProxyStacksAPIConfig.getEndpoint({
        ...dummyContext,
        fn: 'complete',
      })
    ).toBe('');
  });

  it('transforms chatComplete and embed responses with provider attribution', () => {
    const chatTransform = ProxyStacksConfig.responseTransforms
      ?.chatComplete as Function;
    expect(typeof chatTransform).toBe('function');

    const okChat = chatTransform(
      {
        id: 'chatcmpl-1',
        object: 'chat.completion',
        created: 1700000000,
        model: 'kimi-k3.1-pro',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'hello' },
            finish_reason: 'stop',
          },
        ],
      },
      200
    );
    expect(okChat.provider).toBe(PROXYSTACKS);

    const errChat = chatTransform(
      {
        error: {
          message: 'Invalid API key',
          type: 'authentication_error',
          param: null,
          code: 'invalid_api_key',
        },
      },
      401
    );
    expect(errChat.provider).toBe(PROXYSTACKS);

    const embedTransform = ProxyStacksConfig.responseTransforms
      ?.embed as Function;
    expect(typeof embedTransform).toBe('function');
    const okEmbed = embedTransform(
      {
        object: 'list',
        data: [{ object: 'embedding', index: 0, embedding: [0.1, 0.2] }],
        model: 'text-embedding-3-small',
        usage: { prompt_tokens: 3, total_tokens: 3 },
      },
      200
    );
    expect(okEmbed.provider).toBe(PROXYSTACKS);
  });

  it('transforms SSE stream chunks cleanly', () => {
    expect(ProxyStacksChatCompleteStreamChunkTransform('')).toBe('');
    expect(
      ProxyStacksChatCompleteStreamChunkTransform('data: [DONE]\n\n')
    ).toBe('data: [DONE]\n\n');

    const deltaChunk = ProxyStacksChatCompleteStreamChunkTransform(
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"glm-5.3","choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":null}]}\n\n'
    );
    expect(deltaChunk.startsWith('data: ')).toBe(true);
    expect(deltaChunk.endsWith('\n\n')).toBe(true);
    const parsedDelta = JSON.parse(deltaChunk.slice(6).trim());
    expect(parsedDelta.provider).toBe(PROXYSTACKS);
    expect(parsedDelta.choices[0].delta.content).toBe('hi');

    const usageChunk = ProxyStacksChatCompleteStreamChunkTransform(
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","created":1,"model":"glm-5.3","choices":[],"usage":{"prompt_tokens":4,"completion_tokens":2,"total_tokens":6}}\n\n'
    );
    const parsedUsage = JSON.parse(usageChunk.slice(6).trim());
    expect(parsedUsage.provider).toBe(PROXYSTACKS);
    expect(parsedUsage.usage.total_tokens).toBe(6);
  });
});
