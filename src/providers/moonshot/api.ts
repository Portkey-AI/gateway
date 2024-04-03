import { ProviderAPIConfig } from '../types';

const MoonshotAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.moonshot.cn',
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

export default MoonshotAPIConfig;
