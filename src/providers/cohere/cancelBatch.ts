import { CancelBatchResponse, ErrorResponse } from '../types';
import { CohereErrorResponse } from './types';
import { CohereErrorResponseTransform } from './utils';

export const CohereCancelBatchResponseTransform = (
  response: Response | CohereErrorResponse,
  responseStatus: number
): CancelBatchResponse | ErrorResponse => {
  if (responseStatus !== 200 && 'message' in response) {
    return CohereErrorResponseTransform(response);
  }
  return {
    status: 'success',
    object: 'batch',
    id: '',
  };
};
