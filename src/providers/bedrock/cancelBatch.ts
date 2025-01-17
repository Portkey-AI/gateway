import { CancelBatchResponse, ErrorResponse } from '../types';
import { BedrockErrorResponseTransform } from './chatComplete';
import { BedrockErrorResponse } from './embed';

export const BedrockCancelBatchResponseTransform = (
  response: Response | BedrockErrorResponse,
  responseStatus: number,
  _responseHeaders: Headers,
  _strictOpenAiCompliance: boolean,
  gatewayRequestUrl: string
): CancelBatchResponse | ErrorResponse => {
  if (responseStatus !== 200) {
    const errorResposne = BedrockErrorResponseTransform(
      response as BedrockErrorResponse
    );
    if (errorResposne) return errorResposne;
  }
  const batchId = decodeURIComponent(
    gatewayRequestUrl.split('/v1/batches/')[1].split('/')[0]
  );

  return {
    status: 'success',
    object: 'batch',
    id: batchId,
  };
};
