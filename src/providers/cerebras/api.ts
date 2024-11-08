import { ProviderAPIConfig } from '../types';

export const cerebrasAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.cerebras.ai/v1',
  headers: ({ providerOptions }) => {
    return {
      Authorization: `Bearer ${providerOptions.apiKey}`,
      'User-Agent': 'Portkey Gateway/1.0',
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
