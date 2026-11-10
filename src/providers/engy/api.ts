import { ProviderAPIConfig } from '../types';

export const EngyAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => `https://api.engy.ai/v1`,
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
