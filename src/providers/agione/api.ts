import { ProviderAPIConfig } from '../types';

const DEFAULT_AGIONE_BASE_URL = 'https://agione.pro/hyperone/xapi/api/v1';

const AGIoneAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => DEFAULT_AGIONE_BASE_URL,
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

export default AGIoneAPIConfig;
