import { ProviderAPIConfig } from '../types';

const LatitudeAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.lsh.ai',
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

export default LatitudeAPIConfig;
