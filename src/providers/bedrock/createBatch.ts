import { BEDROCK } from '../../globals';
import { Options } from '../../types/requestBody';
import {
  CreateBatchRequest,
  CreateBatchResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';
import { generateInvalidProviderResponseError } from '../utils';
import { BedrockErrorResponseTransform } from './chatComplete';
import { BedrockErrorResponse } from './embed';

interface BedrockCreateBatchRequest extends CreateBatchRequest {
  job_name?: string;
  output_data_config?: {
    s3Uri: string;
  };
  role_arn: string;
}

export const BedrockCreateBatchConfig: ProviderConfig = {
  model: {
    param: 'modelId',
    required: true,
  },
  input_file_id: {
    param: 'inputDataConfig',
    required: true,
    transform: (params: BedrockCreateBatchRequest) => {
      return {
        s3InputDataConfig: {
          s3Uri: decodeURIComponent(params.input_file_id),
        },
      };
    },
  },
  job_name: {
    param: 'jobName',
    required: true,
    default: () => {
      return `portkey-batch-job-${crypto.randomUUID()}`;
    },
  },
  output_data_config: {
    param: 'outputDataConfig',
    required: true,
    default: (params: BedrockCreateBatchRequest, providerOptions: Options) => {
      const inputFileId = decodeURIComponent(params.input_file_id);
      const s3URLToContainingFolder =
        inputFileId.split('/').slice(0, -1).join('/') + '/';
      return {
        s3OutputDataConfig: {
          s3Uri: s3URLToContainingFolder,
          ...(providerOptions.awsServerSideEncryptionKMSKeyId && {
            s3EncryptionKeyId: providerOptions.awsServerSideEncryptionKMSKeyId,
          }),
        },
      };
    },
  },
  role_arn: {
    param: 'roleArn',
    required: true,
  },
};

export const BedrockCreateBatchResponseTransform: (
  response: CreateBatchResponse | BedrockErrorResponse,
  responseStatus: number
) => CreateBatchResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200) {
    const errorResponse = BedrockErrorResponseTransform(
      response as BedrockErrorResponse
    );
    if (errorResponse) return errorResponse;
  }

  if ('jobArn' in response) {
    return {
      id: encodeURIComponent(response.jobArn as string),
      object: 'batch',
    };
  }

  return generateInvalidProviderResponseError(response, BEDROCK);
};
