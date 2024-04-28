import { ProviderAPIConfig } from '../types';

const AtomLLamaAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.atomecho.cn',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` }; // https://openrouter.ai/keys
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

export default AtomLLamaAPIConfig;
