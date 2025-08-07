import { ProviderAPIConfig } from '../types';

const AI302APIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.302.ai',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/v1/chat/completions';
      default:
        return '';
    }
  },
};

export default AI302APIConfig;
