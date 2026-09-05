import { ProviderAPIConfig } from '../types';

export const theGridAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.thegrid.ai/v1',
  headers: ({ providerOptions }) => {
    return {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      case 'createModelResponse':
        return '/responses';
      default:
        return '';
    }
  },
};
