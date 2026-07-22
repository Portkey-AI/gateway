import { ProviderAPIConfig } from '../types';

export const mixlayerAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://models.mixlayer.ai/v1',
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
