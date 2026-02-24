import { CreateBatchRequest, ProviderConfig } from '../types';

interface PortkeySupportedProviderOptions extends CreateBatchRequest {
  /**
   * Bedrock Supported extra Params
   */
  role_arn?: string;

  /**
   * Bedrock and Google Vertex AI Supported extra Params
   */
  model?: string;
  output_data_config?: string;
  job_name?: string;

  /**
   * Portkey Supported extra Params (self reference to all providers extra params.)
   */
  provider_options?: PortkeySupportedProviderOptions;
}

const PARAMS_TO_OMIT = [
  'input_file_id',
  'endpoint',
  'completion_window',
  'metadata',
  'portkey_options',
  'provider_options',
];

export const PortkeyCreateBatchConfig: ProviderConfig = {
  input_file_id: {
    param: 'input_file_id',
    required: true,
  },
  endpoint: {
    param: 'endpoint',
    required: true,
  },
  completion_window: {
    param: 'completion_window',
    required: true,
    default: '24h',
  },
  metadata: {
    param: 'metadata',
    required: false,
  },
  portkey_options: {
    param: 'portkey_options',
    required: true,
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
