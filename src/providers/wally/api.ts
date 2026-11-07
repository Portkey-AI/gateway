import { ProviderAPIConfig } from '../types';

export const wallyAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://inference.runanywhere.ai/v1',
  headers({ providerOptions }) {
    const { apiKey } = providerOptions;
    return { Authorization: `Bearer ${apiKey}` };
  },
  getEndpoint({ fn }) {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      default:
        return '';
    }
  },
};
