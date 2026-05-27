import { AI21 } from '../../globals';
import { ErrorResponse } from '../types';
import { generateErrorResponse } from '../utils';
import { AI21ErrorResponse } from './complete';

export const AI21ErrorResponseTransform: (
  response: AI21ErrorResponse
) => ErrorResponse | undefined = (response) => {
  if ('detail' in response) {
    return generateErrorResponse(
      { message: response.detail, type: null, param: null, code: null },
      AI21
    );
  }

  return undefined;
};
