import { ProviderAPIConfig } from '../types';

const RaindragonAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://inference.raindragon.ai/v1',
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

export default RaindragonAPIConfig;
