import { ProviderAPIConfig } from '../types';

export const nebiusAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.studio.nebius.ai/v1',
  headers({ providerOptions }) {
    const { apiKey } = providerOptions;
    return { Authorization: `Bearer ${apiKey}` };
  },
  getEndpoint({ fn }) {
    switch (fn) {
      case 'chatComplete':
        return `/chat/completions`;
      case 'embed':
        return `/embeddings`;
      case 'complete':
        return '/completions';
      default:
        return '';
    }
  },
};
