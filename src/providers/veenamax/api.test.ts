import VeenaMaxAPIConfig from './api';

describe('VeenaMAX API Config', () => {
  test('should return correct base URL', () => {
    const baseURL = VeenaMaxAPIConfig.getBaseURL({
      providerOptions: {
        provider: 'veenamax',
        apiKey: 'test-key',
      },
      fn: 'createSpeech',
      requestHeaders: {},
      c: {} as any,
      gatewayRequestURL: '',
      params: {},
    });
    expect(baseURL).toBe('https://flash.mayaresearch.ai');
  });

  test('should generate correct headers with API key', async () => {
    const headers = await VeenaMaxAPIConfig.headers({
      providerOptions: {
        provider: 'veenamax',
        apiKey: 'vna_***',
      },
      fn: 'createSpeech',
      c: {} as any,
      transformedRequestBody: {},
      transformedRequestUrl: '',
      gatewayRequestBody: {},
    });

    expect(headers.Authorization).toBe('Bearer vna_***');
    expect(headers['Content-Type']).toBe('application/json');
  });

  test('should return correct endpoint for createSpeech', () => {
    const endpoint = VeenaMaxAPIConfig.getEndpoint({
      c: {} as any,
      providerOptions: {
        provider: 'veenamax',
        apiKey: 'test-key',
      },
      fn: 'createSpeech',
      gatewayRequestBodyJSON: {},
      gatewayRequestBody: {},
      gatewayRequestURL: '',
    });

    expect(endpoint).toBe('/generate');
  });

  test('should return empty string for unsupported functions', () => {
    const endpoint = VeenaMaxAPIConfig.getEndpoint({
      c: {} as any,
      providerOptions: {
        provider: 'veenamax',
        apiKey: 'test-key',
      },
      fn: 'chatComplete',
      gatewayRequestBodyJSON: {},
      gatewayRequestBody: {},
      gatewayRequestURL: '',
    });

    expect(endpoint).toBe('');
  });
});
