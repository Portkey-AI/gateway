import { BEDROCK } from '../../globals';
import { toSnakeCase } from '../../utils/misc';
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
    const errorResponse = BedrockErrorResponseTransform(
      response as BedrockErrorResponse
    );
    if (errorResponse) return errorResponse;
  }

  if ('jobArn' in response) {
    return {
      id: encodeURIComponent(response.jobArn),
      object: 'batch',
      created_at: new Date(response.submitTime).getTime(),
      status: toSnakeCase(response.status),
      input_file_id: encodeURIComponent(
        response.inputDataConfig.s3InputDataConfig.s3Uri
      ),
      output_file_id: encodeURIComponent(
        response.outputDataConfig.s3OutputDataConfig.s3Uri
      ),
      finalizing_at: new Date(response.endTime).getTime(),
      expires_at: new Date(response.jobExpirationTime).getTime(),
      ...(response.message && {
        errors: {
          object: 'list',
          data: [
            {
              // Static to `failed`
              code: 'failed',
              message: response.message,
            },
          ],
        },
        failed_at: new Date(response.lastModifiedTime).getTime(),
      }),
    };
  }

  return generateInvalidProviderResponseError(response, BEDROCK);
};
