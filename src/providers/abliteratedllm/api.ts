import { ProviderAPIConfig } from '../types';

const AbliteratedLLMAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.abliteratedllm.dev/v1',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      case 'complete':
        return '/completions';
      case 'createModelResponse':
        return '/responses';
      default:
        return '';
    }
  },
};

export default AbliteratedLLMAPIConfig;
