import { ProviderAPIConfig } from '../types';

const EmberCloudAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.embercloud.ai/v1',
  headers: ({ providerOptions }) => {
    return {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      case 'stream-chatComplete':
        return '/chat/completions';
      default:
        return '';
    }
  },
};

export default EmberCloudAPIConfig;
