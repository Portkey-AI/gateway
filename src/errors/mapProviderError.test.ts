import { mapProviderError } from './mapProviderError';
import { ERROR_CODES } from './errorConstants';
import { ProviderError } from './ProviderError';

describe('mapProviderError', () => {
  it('should map 401 to PROVIDER_AUTHENTICATION_ERROR', () => {
    const error = mapProviderError('openai', 401, {
      error: { message: 'Invalid API key' },
    });
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.code).toBe(ERROR_CODES.INVALID_API_KEY);
    expect(error.status).toBe(401);
    expect(error.provider).toBe('openai');
    expect(error.message).toContain('Invalid API key');
  });

  it('should map 429 to PROVIDER_RATE_LIMIT', () => {
    const error = mapProviderError('anthropic', 429, {
      error: { message: 'Rate limit exceeded' },
    });
    expect(error.code).toBe(ERROR_CODES.PROVIDER_RATE_LIMIT);
    expect(error.status).toBe(429);
  });

  it('should map 500 to PROVIDER_INTERNAL_ERROR', () => {
    const error = mapProviderError('cohere', 500, { message: 'Server error' });
    expect(error.code).toBe(ERROR_CODES.PROVIDER_INTERNAL_ERROR);
    expect(error.status).toBe(500);
  });

  it('should handle raw error strings', () => {
    const error = mapProviderError('azure', 400, {
      error: 'Bad Request',
    });
    expect(error.code).toBe(ERROR_CODES.PROVIDER_BAD_REQUEST);
    expect(error.message).toContain('Bad Request');
  });

  it('should default to PROVIDER_INTERNAL_ERROR for unknown status', () => {
    const error = mapProviderError('bedrock', 418, {});
    expect(error.code).toBe(ERROR_CODES.PROVIDER_INTERNAL_ERROR);
  });
});
