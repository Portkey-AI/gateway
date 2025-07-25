import { FIREWORKS_AI } from '../../globals';
import { constructConfigFromRequestHeaders } from '../../handlers/handlerUtils';
import { transformUsingProviderConfig } from '../../services/transformToProviderRequest';
import { Options } from '../../types/requestBody';
import { FinetuneRequest, ProviderConfig } from '../types';
import { fireworkFinetuneToOpenAIFinetune } from './utils';

export const getHyperparameters = (value: FinetuneRequest) => {
  let hyperparameters = value?.hyperparameters;
  if (!hyperparameters) {
    const method = value?.method?.type;
    const methodHyperparameters =
      method && value.method?.[method]?.hyperparameters;
    hyperparameters = methodHyperparameters;
  }
  return hyperparameters ?? {};
};

export const FireworksFinetuneCreateConfig: ProviderConfig = {
  training_file: {
    param: 'dataset',
    required: true,
  },
  validation_file: {
    param: 'evaluationDataset',
    required: true,
  },
  suffix: {
    param: 'displayName',
    required: true,
  },
  model: {
    param: 'baseModel',
    required: true,
  },
  hyperparameters: {
    param: 'epochs',
    required: true,
    transform: (value: FinetuneRequest) => {
      return getHyperparameters(value).n_epochs;
    },
  },
  learning_rate: {
    param: 'learning_rate',
    required: true,
    transform: (value: FinetuneRequest) => {
      return getHyperparameters(value).learning_rate_multiplier;
    },
    default: (value: FinetuneRequest) => {
      return getHyperparameters(value).learning_rate_multiplier;
    },
  },
  output_model: {
    // use the suffix as the output model name
    param: 'outputModel',
    required: true,
  },
};

export const FireworksRequestTransform = (
  requestBody: Record<string, any>,
  requestHeaders: Record<string, string>
) => {
  const providerOptions = constructConfigFromRequestHeaders(
    requestHeaders
  ) as Options;

  if (requestBody.training_file) {
    requestBody.training_file = `accounts/${providerOptions.fireworksAccountId}/datasets/${requestBody.training_file}`;
  }

  if (requestBody.validation_file) {
    requestBody.validation_file = `accounts/${providerOptions.fireworksAccountId}/datasets/${requestBody.validation_file}`;
  }

  if (requestBody.model) {
    requestBody.model = `accounts/fireworks/models/${requestBody.model}`;
  }

  if (requestBody.output_model) {
    requestBody.output_model = `accounts/${providerOptions.fireworksAccountId}/models/${requestBody.suffix}`;
  }

  const transformedRequestBody = transformUsingProviderConfig(
    FireworksFinetuneCreateConfig,
    requestBody,
    providerOptions as Options
  );

  return transformedRequestBody;
};

export const FireworkFinetuneTransform = (response: any, status: number) => {
  if (status !== 200) {
    const error = response?.error || 'Failed to create finetune';
    return new Response(
      JSON.stringify({
        error: {
          message: error,
        },
        provider: FIREWORKS_AI,
      }),
      {
        status: status || 500,
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  }

  const mappedResponse = fireworkFinetuneToOpenAIFinetune(response);

  return mappedResponse;
};
