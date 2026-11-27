import { ProviderAPIConfig } from '../types';

const CaymanAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'http://50.114.206.42:8080/v1',
  headers: ({ providerOptions }) => ({
    Authorization: `Bearer ${providerOptions.apiKey}`,
  }),
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'complete':
        return '/completions';
      case 'chatComplete':
        return '/chat/completions';
      default:
        return '';
    }
  },
};

export default CaymanAIAPIConfig;
