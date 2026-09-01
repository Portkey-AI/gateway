import { ProviderAPIConfig } from '../types';

export const OpenZooAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => `https://api.openzoo.fun/v1`,
  headers({ providerOptions }) {
    const { apiKey } = providerOptions;
    const headers = {
      Authorization: `Bearer ${apiKey}`,
    };
    return headers;
  },
  getEndpoint({ fn }) {
    switch (fn) {
      case 'chatComplete': {
        return '/chat/completions';
      }
      default:
        return '';
    }
  },
};
