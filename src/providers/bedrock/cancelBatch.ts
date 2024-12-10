import { CancelBatchResponse, ErrorResponse } from '../types';
import { BedrockErrorResponseTransform } from './chatComplete';
import { BedrockErrorResponse } from './embed';

export const BedrockCancelBatchResponseTransform = (
  response: Response | BedrockErrorResponse,
  responseStatus: number
): CancelBatchResponse | ErrorResponse => {
  if (responseStatus !== 200) {
    const errorResposne = BedrockErrorResponseTransform(
      response as BedrockErrorResponse
    );
    if (errorResposne) return errorResposne;
  }

  return {
    status: 'success',
    object: 'batch',
    id: '',
  };
};
