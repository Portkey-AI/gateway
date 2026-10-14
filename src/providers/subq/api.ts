import { ProviderAPIConfig } from '../types';

export const subqAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.subq.ai/v1',
  headers: ({ providerOptions }) => {
    return {
      Authorization: `Bearer ${providerOptions.apiKey || ''}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Portkey-Gateway-SubQ/1.0',
    };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/systemone';
      default:
        return '/systemone';
    }
  },
};
