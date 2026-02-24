import { ProviderAPIConfig } from '../types';

const MistralAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.mistral.ai/v1',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn, providerOptions }) => {
    if (providerOptions.mistralFimCompletion === 'true') {
      return '/fim/completions';
    }
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

export default MistralAIAPIConfig;
