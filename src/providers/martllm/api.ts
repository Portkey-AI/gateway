import { ProviderAPIConfig } from '../types';

const MartLLMAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.martllm.com/v1',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      default:
        return '';
    }
  },
};

export default MartLLMAPIConfig;
