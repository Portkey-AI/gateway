import { ErrorResponse } from '../types';
import { generateErrorResponse } from '../utils';
import { WORKERS_AI } from '../../globals';

export interface WorkersAiErrorResponse {
  success: boolean;
  errors: WorkersAiErrorObject[];
}

export interface WorkersAiErrorObject {
  code: string;
  message: string;
}

export const WorkersAiErrorResponseTransform: (
  response: WorkersAiErrorResponse
) => ErrorResponse | undefined = (response) => {
  if ('errors' in response) {
    return generateErrorResponse(
      {
        message: response.errors
          ?.map((error) => `Error ${error.code}:${error.message}`)
          .join(', '),
        type: null,
        param: null,
        code: null,
      },
      WORKERS_AI
    );
  }

  return undefined;
};
