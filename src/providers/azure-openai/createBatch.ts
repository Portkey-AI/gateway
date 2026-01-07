import { constructConfigFromRequestHeaders } from '../../handlers/handlerUtils';
import { transformUsingProviderConfig } from '../../services/transformToProviderRequest';
import { Options } from '../../types/requestBody';
import { ProviderConfig } from '../types';

export const AzureOpenAICreateBatchConfig: ProviderConfig = {
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
    default: '24h',
    required: true,
  },
  metadata: {
    param: 'metadata',
    required: false,
  },
  output_expires_after: {
    param: 'output_expires_after',
    required: false,
  },
  input_blob: {
    param: 'input_blob',
    required: false,
  },
  output_folder: {
    param: 'output_folder',
    required: false,
  },
};

export const AzureOpenAICreateBatchRequestTransform = (
  requestBody: any,
  requestHeaders: Record<string, string>
) => {
  const providerOptions = constructConfigFromRequestHeaders(requestHeaders);

  const baseConfig = transformUsingProviderConfig(
    AzureOpenAICreateBatchConfig,
    requestBody,
    providerOptions as Options
  );

  const finalBody = {
    // Contains extra fields like tags etc, also might contains model etc, so order is important to override the fields with params created using config.
    ...requestBody?.provider_options,
    ...baseConfig,
  };

  return finalBody;
};
