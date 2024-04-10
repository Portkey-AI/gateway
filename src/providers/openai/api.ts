import { ProviderAPIConfig } from '../types';

const OpenAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.openai.com/v1',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'complete':
        return '/completions';
      case 'chatComplete':
        return '/chat/completions';
      case 'embed':
        return '/embeddings';
      case 'imageGenerate':
        return '/images/generations';
      default:
        return '';
    }
  },
};

export default OpenAIAPIConfig;
