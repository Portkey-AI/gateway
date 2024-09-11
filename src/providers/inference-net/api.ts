import { ProviderAPIConfig } from '../types';

export const inferenceAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.inference.net/v1',
  headers({ providerOptions }) {
    const { apiKey } = providerOptions;
    return { Authorization: `Bearer ${apiKey}` };
  },
  getEndpoint({ fn }) {
    switch (fn) {
      case 'chatComplete':
        return `/chat/completions`;
      default:
        return '';
    }
  },
};
