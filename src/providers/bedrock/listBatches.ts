import { BEDROCK } from '../../globals';
import { ErrorResponse, ListBatchesResponse } from '../types';
import { generateInvalidProviderResponseError } from '../utils';
import { BedrockErrorResponseTransform } from './chatComplete';
import { BedrockErrorResponse } from './embed';
import { BedrockListBatchesResponse } from './types';

export const BedrockListBatchesResponseTransform = (
  response: BedrockListBatchesResponse | BedrockErrorResponse,
  responseStatus: number
): ListBatchesResponse | ErrorResponse => {
  if (responseStatus !== 200) {
    const errorResponse = BedrockErrorResponseTransform(
      response as BedrockErrorResponse
    );
    if (errorResponse) return errorResponse;
  }

  if ('invocationJobSummaries' in response) {
    const batches = response.invocationJobSummaries.map((batch) => ({
      id: encodeURIComponent(batch.jobArn),
      object: 'batch',
      created_at: new Date(batch.submitTime).getTime(),
      status: batch.status,
      input_file_id: encodeURIComponent(
        batch.inputDataConfig.s3InputDataConfig.s3Uri
      ),
      output_file_id: encodeURIComponent(
        batch.outputDataConfig.s3OutputDataConfig.s3Uri
      ),
      finalizing_at: new Date(batch.endTime).getTime(),
      expires_at: new Date(batch.jobExpirationTime).getTime(),
    }));

    return {
      data: batches,
      object: 'list',
    };
  }

  return generateInvalidProviderResponseError(response, BEDROCK);
};
