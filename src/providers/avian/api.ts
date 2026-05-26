import { ProviderAPIConfig } from '../types';

const AvianAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.avian.io/v1',
  headers: ({ providerOptions }) => {
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

export default AvianAPIConfig;
