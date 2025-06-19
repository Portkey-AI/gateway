import { ProviderAPIConfig } from '../types';

const crofaiApiConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://ai.nahcrof.com/v2',
  headers: ({ providerOptions }) => {
    if (!providerOptions.apiKey) {
      throw new Error('CrofAI API key is required');
    }
    return {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
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

export default crofaiApiConfig;
