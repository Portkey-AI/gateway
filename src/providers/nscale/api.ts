import { ProviderAPIConfig } from '../types';

const NscaleAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://inference.api.nscale.com/v1',
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

export default NscaleAPIConfig;
