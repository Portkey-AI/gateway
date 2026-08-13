import { ProviderAPIConfig } from '../types';

export const TOKEN_FACTORY_BASE_URL = 'https://api.tokenfactory.nebius.com/v1';

export const nebiusAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => TOKEN_FACTORY_BASE_URL,
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
