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
};
