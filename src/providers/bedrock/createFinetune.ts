import { ErrorResponse, FinetuneRequest, ProviderConfig } from '../types';
import { BedrockErrorResponseTransform } from './chatComplete';
import { POWERED_BY } from '../../globals';

const transform = (
  values: FinetuneRequest & { roleArn?: string; job_name?: string }
) => {
  const config: Record<string, unknown> = {
    customizationType: 'FINE_TUNING',
    jobName: values.job_name,
  };

  if (values.model) {
    const model = values.provider_options?.['model'] || values.model;
    config.baseModelIdentifier = model;
  }

  if (values.suffix) {
    config.customModelName = values.suffix;
  }

  if (values.hyperparameters) {
    let hyperparameters = values?.hyperparameters ?? {};
    if (!hyperparameters) {
      const method = values.method?.type;
      if (!method || !values.method?.[method]?.hyperparameters) {
        return null;
      }
      hyperparameters = {
        ...(values.method?.[method]?.hyperparameters ?? {}),
      };
    }
    config.hyperParameters = {
      ...(hyperparameters?.n_epochs
        ? { epochCount: String(hyperparameters?.n_epochs) || null }
        : {}),
      ...(hyperparameters?.learning_rate_multiplier
        ? {
            learningRateMultiplier: Number(
              hyperparameters?.learning_rate_multiplier
            ),
          }
        : {}),
      ...(hyperparameters?.batch_size
        ? { batchSize: Number(hyperparameters?.batch_size) }
        : {}),
    };
  }

  if (values.training_file) {
    config.trainingDataConfig = {
      s3Uri: values.training_file,
    };
    config.outputDataConfig = {
      s3Uri:
        values.training_file.substring(
          0,
          values.training_file.lastIndexOf('/') + 1
        ) + values.suffix,
    };
  }

  if (values.validation_file) {
    config.validationDataConfig = {
      s3Uri: values.validation_file,
    };
  }

  config.roleArn = values.roleArn;

  return config;
};

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
  },
  training_file: {
    param: 'trainingDataConfig',
    required: true,
  },
  validation_file: {
    param: 'validationDataConfig',
    required: false,
  },
  method: {
    param: 'method',
    required: false,
  },
  job_name: {
    param: 'jobName',
    required: true,
  },
};

export const BedrockCreateFinetuneResponseTransform: (
  response: Response | ErrorResponse,
  responseStatus: number
) => Response | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200) {
    return BedrockErrorResponseTransform(response as any) || response;
  }

  return { id: (response as any).jobArn } as any;
};

export const BedrockRequestTransform = (
  requestBody: FinetuneRequest & { roleArn?: string },
  requestHeaders: Record<string, string>
) => {
  const bedrockRoleARN =
    requestHeaders?.[`x-${POWERED_BY}-aws-bedrock-role-arn`];
  const body = { ...requestBody };
  if (bedrockRoleARN) {
    body.roleArn = bedrockRoleARN;
  }
  const transformedBody = transform(body as FinetuneRequest);
  return transformedBody;
};
