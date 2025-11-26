import { GatewayError } from '../errors/GatewayError';
import { ERROR_CODES } from '../errors/errorConstants';

describe('GatewayError', () => {
  it('should have default code GATEWAY_INTERNAL_ERROR', () => {
    const error = new GatewayError('Something went wrong');
    expect(error.code).toBe(ERROR_CODES.GATEWAY_INTERNAL_ERROR);
    expect(error.status).toBe(500);
    expect(error.message).toBe('Something went wrong');
  });

  it('should accept custom status', () => {
    const error = new GatewayError('Timeout', 504);
    expect(error.code).toBe(ERROR_CODES.GATEWAY_INTERNAL_ERROR);
    expect(error.status).toBe(504);
  });
});
