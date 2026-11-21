import { ProviderAPIConfig } from '../types';

const CrowLLMAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://crowllm.com',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/v1/chat/completions';
      default:
        return '';
    }
  },
};

export default CrowLLMAPIConfig;
