import { GatewayError } from '../errors/GatewayError';

jest.mock('../providers', () => ({
  __esModule: true,
  default: {
    openai: {
      chatComplete: {},
      api: {},
    },
    google: {
      chatComplete: {},
      api: {},
    },
    anthropic: {
      messages: {
        model: { param: 'model', required: true },
        max_tokens: { param: 'max_tokens', required: true },
        messages: { param: 'messages', required: true },
      },
      api: {},
    },
  },
}));

import { transformToProviderRequest } from './transformToProviderRequest';

describe('transformToProviderRequest: unsupported messages endpoint', () => {
  const params = {
    model: 'gpt-4o',
    max_tokens: 256,
    messages: [{ role: 'user', content: 'hi' }],
  };

  it.each(['openai', 'google'] as const)(
    'throws GatewayError status 400 for messages on %s',
    (provider) => {
      let caught: unknown;
      try {
        transformToProviderRequest(
          provider,
          params as any,
          params as any,
          'messages',
          {},
          { provider } as any
        );
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(GatewayError);
      expect((caught as GatewayError).status).toBe(400);
      expect((caught as GatewayError).message).toBe(
        `messages is not supported by ${provider}`
      );
    }
  );

  it('still transforms messages for anthropic', () => {
    const body = transformToProviderRequest(
      'anthropic',
      {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 256,
        messages: [{ role: 'user', content: 'hi' }],
      } as any,
      {} as any,
      'messages',
      {},
      { provider: 'anthropic' } as any
    );
    expect(body).toMatchObject({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 256,
      messages: [{ role: 'user', content: 'hi' }],
    });
  });
});
