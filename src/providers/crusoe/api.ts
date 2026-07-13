import { ProviderAPIConfig } from '../types';

export const CrusoeAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.inference.crusoecloud.com/v1',
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
