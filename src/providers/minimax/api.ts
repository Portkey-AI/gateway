import { ProviderAPIConfig } from '../types';

const MiniMaxAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.minimax.io/v1',
  headers: ({ providerOptions }) => {
    return {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
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

export default MiniMaxAPIConfig;
