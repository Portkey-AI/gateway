import { ProviderAPIConfig } from '../types';

const SaladCloudAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://ai.salad.cloud/v1',
  headers: ({ providerOptions }) => ({
    Authorization: `Bearer ${providerOptions.apiKey}`,
  }),
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      default:
        return '';
    }
  },
};

export default SaladCloudAPIConfig;
