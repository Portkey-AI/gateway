import HuggingfaceAPIConfig from '../api';

const mockContext = {} as any;

describe('HuggingFace API routing', () => {
  test('throws config error for image model without dedicated endpoint', () => {
    const fn = () =>
      HuggingfaceAPIConfig.getEndpoint({
        c: mockContext,
        fn: 'imageGenerate',
        gatewayRequestBodyJSON: {
          model: 'black-forest-labs/FLUX.1-dev',
        },
        providerOptions: {
          provider: 'huggingface',
          apiKey: 'test-key',
        },
        gatewayRequestURL: '/v1/images/generations',
      });

    expect(fn).toThrow(/dedicated inference endpoint/i);
  });

  test('uses POST / for image model with dedicated endpoint', () => {
    const endpoint = HuggingfaceAPIConfig.getEndpoint({
      c: mockContext,
      fn: 'imageGenerate',
      gatewayRequestBodyJSON: {
        model: 'black-forest-labs/FLUX.1-dev',
      },
      providerOptions: {
        provider: 'huggingface',
        apiKey: 'test-key',
        huggingfaceBaseUrl:
          'https://abc123.us-east-1.aws.endpoints.huggingface.cloud',
      },
      gatewayRequestURL: '/v1/images/generations',
    });

    expect(endpoint).toBe('');
  });

  test('chatComplete routing remains unchanged', () => {
    const endpoint = HuggingfaceAPIConfig.getEndpoint({
      c: mockContext,
      fn: 'chatComplete',
      gatewayRequestBodyJSON: {
        model: 'meta-llama/Llama-3.1-8B-Instruct',
      },
      providerOptions: {
        provider: 'huggingface',
        apiKey: 'test-key',
      },
      gatewayRequestURL: '/v1/chat/completions',
    });

    expect(endpoint).toContain('/v1/chat/completions');
  });
});
