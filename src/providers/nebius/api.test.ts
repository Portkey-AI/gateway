import { nebiusAPIConfig, TOKEN_FACTORY_BASE_URL } from './api';

const apiArgs = {
  c: {} as never,
  providerOptions: { provider: 'nebius', apiKey: 'test-key' },
  fn: 'chatComplete' as const,
  transformedRequestBody: {},
  transformedRequestUrl: '',
  gatewayRequestURL: '',
};

describe('Nebius Token Factory API config', () => {
  test('uses the canonical Token Factory API base', () => {
    expect(nebiusAPIConfig.getBaseURL(apiArgs)).toBe(TOKEN_FACTORY_BASE_URL);
    expect(TOKEN_FACTORY_BASE_URL).toBe(
      'https://api.tokenfactory.nebius.com/v1'
    );
  });

  test('authenticates requests with the configured bearer token', async () => {
    expect(await nebiusAPIConfig.headers(apiArgs)).toEqual({
      Authorization: 'Bearer test-key',
    });
  });

  test.each([
    ['chatComplete', '/chat/completions'],
    ['embed', '/embeddings'],
    ['complete', '/completions'],
  ] as const)('maps %s requests to %s', (fn, endpoint) => {
    expect(
      nebiusAPIConfig.getEndpoint({
        ...apiArgs,
        fn,
        gatewayRequestBodyJSON: {},
        gatewayRequestURL: '',
      })
    ).toBe(endpoint);
  });

  test('does not add a provider-specific Responses API route', () => {
    expect(
      nebiusAPIConfig.getEndpoint({
        ...apiArgs,
        fn: 'createModelResponse',
        gatewayRequestBodyJSON: {},
        gatewayRequestURL: '',
      })
    ).toBe('');
  });
});
