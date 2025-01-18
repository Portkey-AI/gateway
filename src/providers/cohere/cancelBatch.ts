import { CancelBatchResponse, ErrorResponse } from '../types';
import { CohereErrorResponse } from './types';
import { CohereErrorResponseTransform } from './utils';

export const CohereCancelBatchResponseTransform = (
  response: Response | CohereErrorResponse,
  responseStatus: number,
  _responseHeaders: Record<string, string>,
  _strictOpenAiCompliance: boolean,
  gatewayRequestUrl: string
): CancelBatchResponse | ErrorResponse => {
  if (responseStatus !== 200 && 'message' in response) {
    return CohereErrorResponseTransform(response);
  }
  return {
    status: 'success',
    object: 'batch',
    id:
      gatewayRequestUrl?.split('/v1/batches/')?.[1]?.replace('/cancel', '') ||
      '',
  };
};
