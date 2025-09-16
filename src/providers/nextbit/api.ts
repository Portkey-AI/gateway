import { ProviderAPIConfig } from '../types';

export const nextBitAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.nextbit256.com/v1',
  headers({ providerOptions }) {
    const { apiKey } = providerOptions;
    return { Authorization: `Bearer ${apiKey}` };
  },
  getEndpoint({ fn }) {
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
