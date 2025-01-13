import { BEDROCK } from '../../globals';
import { ProviderConfig } from '../types';

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
  model: {
    param: 'provider_options',
    required: false,
    transform: (params: any) => {
      // bedrock specific options
      return {
        model: params.model,
        outputDataConfig: params.outputDataConfig,
        roleArn: params.roleArn,
        jobName: params.jobName,
        provider: BEDROCK,
      };
    },
  },
};
