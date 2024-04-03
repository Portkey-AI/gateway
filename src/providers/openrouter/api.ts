import { ProviderAPIConfig } from '../types';

const OpenrouterAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://openrouter.ai/api',
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

export default OpenrouterAPIConfig;
