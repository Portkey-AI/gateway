import { PortkeyError } from './PortkeyError';
import { ERROR_CODES } from './errorConstants';

export class GatewayError extends PortkeyError {
  constructor(
    message: string,
    status?: number,
    code: string = ERROR_CODES.GATEWAY_INTERNAL_ERROR,
    public cause?: Error
  ) {
    super(code, message, status);
    this.name = 'GatewayError';
  }
}
