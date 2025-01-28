import { ProviderAPIConfig } from '../types';

const ReplicateApiConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.replicate.com/v1',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn }) => '',
};

export default ReplicateApiConfig;
