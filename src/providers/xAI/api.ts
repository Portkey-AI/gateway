import { ProviderAPIConfig } from '../types';

const xAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.x.ai/v1',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      default:
        return '';
    }
  },
};

export default xAIAPIConfig;
