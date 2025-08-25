import { ProviderAPIConfig } from '../types';

const KlusterAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => `https://api.kluster.ai/v1`,
  headers: ({ providerOptions }) => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${providerOptions.apiKey}`,
  }),
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      case 'embed':
        return '/embeddings';
      case 'uploadFile':
        return '/files';
      default:
        return '';
    }
  },
};

export default KlusterAIAPIConfig;
