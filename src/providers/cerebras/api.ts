import { ProviderAPIConfig } from '../types';

export const cerebrasAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'http://localhost:8009/v1',
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
