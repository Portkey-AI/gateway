import { ErrorResponse } from '../types';
import { generateErrorResponse } from '../utils';

export const MartianErrorResponseTransform: (
  response: ErrorResponse,
  provider: string
) => ErrorResponse = (response, provider) => {
  return generateErrorResponse(
    {
      ...response.error,
    },
    provider
  );
};
