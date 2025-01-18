import { ErrorResponse } from '../types';
import { OPEN_AI } from '../../globals';
import { OpenAIErrorResponseTransform } from './utils';

export const OpenAIDeleteFileResponseTransform: (
  response: Response | ErrorResponse,
  responseStatus: number
) => Response | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, OPEN_AI);
  }

  return response;
};
