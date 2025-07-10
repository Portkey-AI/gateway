import { ProviderAPIConfig } from '../types';

const XAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://ai.nahcrof.com/v2',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      case 'complete':
        return '/completions';
      case 'embed':
        return '/embeddings';
      default:
        return '';
    }
  },
};

export default crofAIAPIConfig;
