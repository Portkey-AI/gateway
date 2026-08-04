import { ProviderAPIConfig } from '../types';

const DEFAULT_SALADCLOUD_BASE_URL = 'https://ai.salad.cloud/v1';

const SaladCloudAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => DEFAULT_SALADCLOUD_BASE_URL,
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
