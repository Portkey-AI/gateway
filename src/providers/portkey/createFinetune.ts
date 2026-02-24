import { OpenAICreateFinetuneConfig } from '../openai/createFinetune';
import { FinetuneRequest, ProviderConfig } from '../types';

interface PortkeySupportedProviderOptions
  extends Omit<FinetuneRequest, 'provider_options'> {
  /**
   * Bedrock Supported extra Params
   */
  output_file_id?: string;
  job_name?: string;
  role_arn?: string;
  customization_type?: string;
  model: string;

  /**
   * Portkey Supported extra Params (self reference to all providers extra params.)
   */
  provider_options?: PortkeySupportedProviderOptions;
}

const PARAMS_TO_OMIT = [
  'model',
  'suffix',
  'training_file',
  'validation_file',
  'hyperparameters',
  'method',
  'seed',
  'integrations',
  'portkey_options',
  'provider_options',
];

export const PortkeyCreateFinetuneConfig: ProviderConfig = {
  ...OpenAICreateFinetuneConfig,
  portkey_options: {
    param: 'portkey_options',
    required: true,
  },
  model_type: {
    param: 'model_type',
    required: false,
    default: 'chat',
  },
  provider_options: {
    param: 'provider_options',
    required: true,
    transform: (params: PortkeySupportedProviderOptions) => {
      let options = {} as Record<string, unknown>;
      if (params.provider_options) {
        options = { ...params.provider_options };
      }

      // Spread all params except for the OpenAI params, portkey service expect extra params in the provider_options
      Object.entries(params).forEach(([key, value]) => {
        if (!PARAMS_TO_OMIT.includes(key)) {
          options[key] = value;
        }
      });

      return options;
    },
    default: (params: PortkeySupportedProviderOptions) => {
      const options: Record<string, unknown> = {};
      Object.entries(params).forEach(([key, value]) => {
        if (!PARAMS_TO_OMIT.includes(key)) {
          options[key] = value;
        }
      });

      return options;
    },
  },
};
