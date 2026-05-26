import retry from 'async-retry';
import { retryRequest } from '../../../../src/handlers/retryHandler';

jest.mock('async-retry', () => ({
  __esModule: true,
  default: jest.fn(async (handler) => {
    await handler(jest.fn(), 1, { _timeouts: [] });
  }),
}));

const mockedRetry = retry as jest.Mock;

describe('retryRequest retry backoff options', () => {
  beforeEach(() => {
    mockedRetry.mockClear();
  });

  it('randomizes retry backoff by default to avoid synchronized retry bursts', async () => {
    await retryRequest(
      'https://api.example.com',
      {},
      2,
      [503],
      null,
      jest.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    );

    expect(mockedRetry).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        retries: 2,
        randomize: true,
      })
    );
  });

  it('passes bounded retry backoff settings through to async-retry', async () => {
    await retryRequest(
      'https://api.example.com',
      {},
      3,
      [429, 503],
      null,
      jest.fn().mockResolvedValue(new Response('ok', { status: 200 })),
      false,
      {
        minTimeout: 250,
        maxTimeout: 2_000,
        factor: 1.5,
        randomize: false,
      }
    );

    expect(mockedRetry).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        retries: 3,
        minTimeout: 250,
        maxTimeout: 2_000,
        factor: 1.5,
        randomize: false,
      })
    );
  });
});
