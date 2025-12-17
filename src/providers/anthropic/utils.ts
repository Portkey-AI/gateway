import { ErrorResponse } from '../types';
import { generateErrorResponse } from '../utils';
import { AnthropicErrorResponse } from './types';

export const AnthropicErrorResponseTransform: (
  response: AnthropicErrorResponse,
  provider: string
) => ErrorResponse = (response, provider) => {
  return generateErrorResponse(
    {
      message: response.error?.message,
      type: response.error?.type,
      param: null,
      code: null,
    },
    provider
  );
};
