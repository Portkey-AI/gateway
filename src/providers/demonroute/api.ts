import { ProviderAPIConfig } from '../types';

const DemonRouteAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.demonroute.com/v1',
  headers: ({ providerOptions }) => {
    return {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      case 'complete':
        return '/completions';
      default:
        return '';
    }
  },
};

export default DemonRouteAPIConfig;
