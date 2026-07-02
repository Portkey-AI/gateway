import QdrantAPIConfig from './api';

describe('Qdrant API config', () => {
  it('sends the raw api key without a Bearer prefix', () => {
    const headers = QdrantAPIConfig.headers({
      providerOptions: { apiKey: 'my-secret-key' },
      fn: 'chatComplete',
      transformedRequestBody: {},
      transformedRequestUrl: '',
      gatewayRequestBody: {},
    } as any);

    // Qdrant expects the raw key in `api-key`; a `Bearer ` prefix 401s.
    expect(headers).toEqual({ 'api-key': 'my-secret-key' });
  });
});
