import { SALADCLOUD } from '../../globals';
import SaladCloudAPIConfig from './api';

describe('SaladCloud provider', () => {
  const providerOptions = { provider: SALADCLOUD, apiKey: 'test-key' };

  it('uses the SaladCloud OpenAI-compatible chat completions endpoint', () => {
    const baseURLArgs = {
      providerOptions,
    } as Parameters<typeof SaladCloudAPIConfig.getBaseURL>[0];
    const endpointArgs = {
      fn: 'chatComplete',
      providerOptions,
    } as Parameters<typeof SaladCloudAPIConfig.getEndpoint>[0];
    const headerArgs = {
      providerOptions,
    } as Parameters<typeof SaladCloudAPIConfig.headers>[0];

    expect(SaladCloudAPIConfig.getBaseURL(baseURLArgs)).toEqual(
      'https://ai.salad.cloud/v1'
    );
    expect(SaladCloudAPIConfig.getEndpoint(endpointArgs)).toEqual(
      '/chat/completions'
    );
    expect(SaladCloudAPIConfig.headers(headerArgs)).toEqual({
      Authorization: 'Bearer test-key',
    });
  });
});
