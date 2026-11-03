import { ProviderAPIConfig } from '../types';

const PrentisAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://compute.prentis.ai/v1',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      case 'complete':
        return '/completions';
      default:
        return '';
    }
  },
};

export default PrentisAPIConfig;
