import { DeleteFileResponse, ErrorResponse } from '../types';
import { CohereErrorResponse } from './types';
import { CohereErrorResponseTransform } from './utils';

export const CohereDeleteFileResponseTransform: (
  response: Response | CohereErrorResponse,
  responseStatus: number
) => DeleteFileResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'message' in response) {
    return CohereErrorResponseTransform(response);
  }
  return {
    object: 'file',
    deleted: true,
    id: '',
  };
};
