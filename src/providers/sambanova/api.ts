import { ProviderAPIConfig } from '../types';

const SambaNovaAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) =>
    providerOptions.urlToFetch || 'https://fast-api.snova.ai/v1',
  headers: ({ providerOptions }) => {
    return { Authorization: `Basic ${providerOptions.apiKey}` };
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

export default SambaNovaAPIConfig;
