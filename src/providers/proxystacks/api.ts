import { ProviderAPIConfig } from '../types';

export const DEFAULT_PROXYSTACKS_BASE_URL = 'https://proxystacks.com/v1';

const ProxyStacksAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => DEFAULT_PROXYSTACKS_BASE_URL,
  headers: ({ providerOptions }) => {
    return {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
      case 'stream-chatComplete':
        return '/chat/completions';
      case 'embed':
        return '/embeddings';
      default:
        return '';
    }
  },
};

export default ProxyStacksAPIConfig;
