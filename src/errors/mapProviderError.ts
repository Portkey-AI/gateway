import { ProviderError } from './ProviderError';
import { ERROR_CODES, ERROR_MESSAGES } from './errorConstants';

export const mapProviderError = (
  provider: string,
  status: number,
  rawError: any
): ProviderError => {
  let code: string = ERROR_CODES.PROVIDER_INTERNAL_ERROR;
  let message: string = ERROR_MESSAGES[ERROR_CODES.PROVIDER_INTERNAL_ERROR];

  // Map HTTP status codes to Portkey error codes
  switch (status) {
    case 400:
      code = ERROR_CODES.PROVIDER_BAD_REQUEST;
      message = ERROR_MESSAGES[ERROR_CODES.PROVIDER_BAD_REQUEST];
      break;
    case 401:
    case 403:
      code = ERROR_CODES.PROVIDER_AUTHENTICATION_ERROR;
      message = ERROR_MESSAGES[ERROR_CODES.PROVIDER_AUTHENTICATION_ERROR];
      break;
    case 404:
      code = ERROR_CODES.PROVIDER_NOT_FOUND;
      message = ERROR_MESSAGES[ERROR_CODES.PROVIDER_NOT_FOUND];
      break;
    case 408:
      code = ERROR_CODES.PROVIDER_TIMEOUT;
      message = ERROR_MESSAGES[ERROR_CODES.PROVIDER_TIMEOUT];
      break;
    case 429:
      code = ERROR_CODES.PROVIDER_RATE_LIMIT;
      message = ERROR_MESSAGES[ERROR_CODES.PROVIDER_RATE_LIMIT];
      break;
    case 500:
    case 502:
    case 503:
    case 504:
      code = ERROR_CODES.PROVIDER_INTERNAL_ERROR;
      message = ERROR_MESSAGES[ERROR_CODES.PROVIDER_INTERNAL_ERROR];
      break;
  }

  // Extract more specific message from raw error if available
  // This is a best-effort extraction based on common provider formats
  const rawMessage =
    rawError?.error?.message || rawError?.message || rawError?.error;
  if (rawMessage && typeof rawMessage === 'string') {
    message = `${message}: ${rawMessage}`;
  }

  return new ProviderError(code, message, provider, status, rawError);
};
