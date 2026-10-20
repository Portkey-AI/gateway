import { ProviderAPIConfig } from '../types';

export const HopperAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.withhopper.com/v1',
  headers: ({ providerOptions }) => ({
    Authorization: `Bearer ${providerOptions.apiKey}`,
  }),
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
      case 'stream-chatComplete':
        return '/chat/completions';
      default:
        return '';
    }
  },
};
