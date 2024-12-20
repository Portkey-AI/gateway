import { ErrorResponse } from '../types';
import { generateErrorResponse } from '../utils';

export const RecraftAIErrorResponseTransform: (
  response: ErrorResponse,
  provider: string
) => ErrorResponse = (response, provider) => {
  return generateErrorResponse(
    {
      message: response.error?.message || 'Unknown error occurred',
      type: response.error?.type || null,
      param: response.error?.param || null,
      code: response.error?.code || null,
    },
    provider
  );
};
