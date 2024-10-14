import { ProviderAPIConfig } from '../types';

export const LambdaAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => `https://api.lambdalabs.com/v1`,
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
      case 'complete': {
        return '/completions';
      }
      default:
        return '';
    }
  },
};
