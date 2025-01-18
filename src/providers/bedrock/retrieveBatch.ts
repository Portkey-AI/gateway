import { BEDROCK } from '../../globals';
import { ErrorResponse, RetrieveBatchResponse } from '../types';
import { generateInvalidProviderResponseError } from '../utils';
import { BedrockErrorResponseTransform } from './chatComplete';
import { BedrockErrorResponse } from './embed';
import { BedrockGetBatchResponse } from './types';

export const BedrockRetrieveBatchResponseTransform = (
  response: BedrockGetBatchResponse | BedrockErrorResponse,
  responseStatus: number
): RetrieveBatchResponse | ErrorResponse => {
  if (responseStatus !== 200) {
    const errorResposne = BedrockErrorResponseTransform(
      response as BedrockErrorResponse
    );
    if (errorResposne) return errorResposne;
  }

  if ('jobArn' in response) {
    return {
      id: response.jobArn,
      object: 'batch',
      created_at: new Date(response.submitTime).getTime(),
      status: response.status,
      input_file_id: response.inputDataConfig.s3InputDataConfig.s3Uri,
      output_file_id: response.outputDataConfig.s3OutputDataConfig.s3Uri,
      finalizing_at: new Date(response.endTime).getTime(),
      expires_at: new Date(response.jobExpirationTime).getTime(),
    };
  }

  return generateInvalidProviderResponseError(response, BEDROCK);
};
