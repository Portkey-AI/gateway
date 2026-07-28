import { MODELSELL, VALID_PROVIDERS } from '../../globals';
import ModelsellAPIConfig from './api';

describe('Modelsell provider', () => {
  test('is registered without a hardcoded model catalog', () => {
    expect(VALID_PROVIDERS).toContain(MODELSELL);
  });

  test('uses the Modelsell API base and bearer authentication', async () => {
    expect(await ModelsellAPIConfig.getBaseURL({} as never)).toBe(
      'https://modelsell.com/v1'
    );

    expect(
      await ModelsellAPIConfig.headers({
        providerOptions: { apiKey: 'test-api-key' },
      } as never)
    ).toEqual({
      Authorization: 'Bearer test-api-key',
    });
  });

  test('routes chat completions and dynamic model discovery', async () => {
    expect(
      ModelsellAPIConfig.getEndpoint({ fn: 'chatComplete' } as never)
    ).toBe('/chat/completions');
    expect(
      ModelsellAPIConfig.getEndpoint({ fn: 'stream-chatComplete' } as never)
    ).toBe('/chat/completions');

    const modelPath = ModelsellAPIConfig.getProxyEndpoint?.({
      reqPath: '/models',
      reqQuery: '',
      providerOptions: { apiKey: 'test-api-key', provider: MODELSELL },
    });
    expect(
      `${await ModelsellAPIConfig.getBaseURL({} as never)}${modelPath}`
    ).toBe('https://modelsell.com/v1/models');
  });
});
