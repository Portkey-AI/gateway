import { BEDROCK } from '../../globals';
import { CreateBatchResponse, ErrorResponse, ProviderConfig } from '../types';
import { generateInvalidProviderResponseError } from '../utils';
import { BedrockErrorResponseTransform } from './chatComplete';
import { BedrockErrorResponse } from './embed';

export const BedrockCreateBatchConfig: ProviderConfig = {
  model: {
    param: 'modelId',
    required: true,
  },
  input_file_id: {
    param: 'inputDataConfig',
    required: true,
    transform: (params: CreateBatchResponse) => {
      return {
        s3InputDataConfig: {
          s3Uri: params.input_file_id,
        },
      };
    },
  },
  jobName: {
    param: 'jobName',
    required: true,
    default: 'portkey-batch-job',
  },
  outputDataConfig: {
    param: 'outputDataConfig',
    required: true,
  },
  roleArn: {
    param: 'roleArn',
    required: true,
  },
};

export const BedrockCreateBatchResponseTransform: (
  response: CreateBatchResponse | BedrockErrorResponse,
  responseStatus: number
) => CreateBatchResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200) {
    const errorResposne = BedrockErrorResponseTransform(
      response as BedrockErrorResponse
    );
    if (errorResposne) return errorResposne;
  }

  if ('jobArn' in response) {
    return {
      id: response.jobArn as string,
      object: 'batch',
    };
  }

  return generateInvalidProviderResponseError(response, BEDROCK);
};
