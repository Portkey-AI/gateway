import { ProviderAPIConfig } from '../types';

const KymaAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://kymaapi.com/v1',
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

export default KymaAPIConfig;
