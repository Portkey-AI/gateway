import { ProviderAPIConfig } from '../types';

const GreenPTAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.greenpt.ai/v1',
  headers: ({ providerOptions }) => ({
    Authorization: `Bearer ${providerOptions.apiKey}`,
  }),
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      case 'embed':
        return '/embeddings';
      default:
        return '';
    }
  },
};

export default GreenPTAPIConfig;
