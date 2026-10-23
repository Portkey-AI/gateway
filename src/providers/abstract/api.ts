import { ProviderAPIConfig } from '../types';

const AbstractAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.abstract.inc/v1',
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

export default AbstractAPIConfig;
