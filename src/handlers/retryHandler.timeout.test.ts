import { retryRequest } from './retryHandler';

describe('retryRequest requestHandler timeout enforcement', () => {
  it('returns a 408 timeout response when a custom requestHandler exceeds the timeout', async () => {
    // A provider requestHandler (e.g. getBatchOutput / uploadFile) that resolves
    // only after 200ms, while the per-request timeout is 20ms.
    const slowRequestHandler = () =>
      new Promise<Response>((resolve) => {
        setTimeout(() => {
          resolve(new Response('too late', { status: 200 }));
        }, 200);
      });

    const { response } = await retryRequest(
      'https://example.com/v1/batches/out',
      { method: 'GET' },
      0, // no retries
      [], // no status codes to retry
      20, // 20ms timeout
      slowRequestHandler
    );

    expect(response.status).toBe(408);
    const body = (await response.json()) as { error: { type: string } };
    expect(body.error.type).toBe('timeout_error');
  });
});
