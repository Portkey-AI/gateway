import { ProviderAPIConfig } from '../types';

export const featherlessAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.featherless.ai/v1',
  headers({ providerOptions }) {
    const { apiKey } = providerOptions;
    return { Authorization: `Bearer ${apiKey}` };
  },
  getEndpoint({ fn }) {
    switch (fn) {
      case 'chatComplete':
        return `/chat/completions`;
      case 'complete':
        return '/completions';
      default:
        return '';
    }
  },
};
