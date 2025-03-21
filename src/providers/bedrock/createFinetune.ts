import { ErrorResponse, FinetuneRequest, ProviderConfig } from '../types';
import { BedrockErrorResponseTransform } from './chatComplete';
import { BedrockErrorResponse } from './embed';
import { populateHyperParameters } from './utils';

export const BedrockCreateFinetuneConfig: ProviderConfig = {
  model: {
    param: 'baseModelIdentifier',
    required: true,
  },
  suffix: {
    param: 'customModelName',
    required: true,
  },
  hyperparameters: {
    param: 'hyperParameters',
    required: false,
    transform: (value: FinetuneRequest) => {
      const hyperParameters = populateHyperParameters(value);
      const epochCount = hyperParameters.n_epochs;
      const learningRateMultiplier = hyperParameters.learning_rate_multiplier;
      const batchSize = hyperParameters.batch_size;
      return {
        epochCount: epochCount ? String(epochCount) : undefined,
        learningRateMultiplier: learningRateMultiplier
          ? String(learningRateMultiplier)
          : undefined,
        batchSize: batchSize ? String(batchSize) : undefined,
      };
    },
  },
  training_file: {
    param: 'trainingDataConfig',
    required: true,
    transform: (value: FinetuneRequest) => {
      return {
        s3Uri: decodeURIComponent(value.training_file),
      };
    },
  },
  validation_file: {
    param: 'validationDataConfig',
    required: false,
    transform: (value: FinetuneRequest) => {
      if (!value.validation_file) {
        return undefined;
      }
      return {
        s3Uri: decodeURIComponent(value.validation_file),
      };
    },
  },
  output_file: {
    param: 'outputDataConfig',
    required: true,
    default: (value: FinetuneRequest) => {
      const trainingFile = decodeURIComponent(value.training_file);
      const uri =
        trainingFile.substring(0, trainingFile.lastIndexOf('/') + 1) +
        value.suffix;
      return {
        s3Uri: uri,
      };
    },
  },
  job_name: {
    param: 'jobName',
    required: true,
    default: (value: FinetuneRequest & { job_name: string }) => {
      return value.job_name ?? `portkey-finetune-${crypto.randomUUID()}`;
    },
  },
  role_arn: {
    param: 'roleArn',
    required: true,
  },
  customization_type: {
    param: 'customizationType',
    required: true,
    default: 'FINE_TUNING',
  },
};

const OK_STATUS = [200, 201];

export const BedrockCreateFinetuneResponseTransform: (
  response: Response | ErrorResponse,
  responseStatus: number
) => Record<string, unknown> | ErrorResponse = (response, responseStatus) => {
  Response;
  if (!OK_STATUS.includes(responseStatus) || 'error' in response) {
    return (
      BedrockErrorResponseTransform(response as BedrockErrorResponse) ||
      (response as ErrorResponse)
    );
  }

  return { id: encodeURIComponent((response as any).jobArn) };
};
