import { ProviderAPIConfig } from '../types';

const HuggingfaceAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    return (
      providerOptions.huggingfaceBaseUrl || 'https://router.huggingface.co'
    );
  },
  headers: ({ providerOptions }) => ({
    Authorization: `Bearer ${providerOptions.apiKey}`,
  }),
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/v1/chat/completions';
      case 'complete':
        return '/v1/completions';
      default:
        return '';
    }
  },
};

export default HuggingfaceAPIConfig;
