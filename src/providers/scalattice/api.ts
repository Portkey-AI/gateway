import { ProviderAPIConfig } from '../types';

const ScalatticeAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.scalattice.cloud/v1',
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

export default ScalatticeAPIConfig;
