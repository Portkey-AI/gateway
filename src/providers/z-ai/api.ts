import { ProviderAPIConfig } from '../types';

const ZAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.z.ai/api/paas/v4',
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

export default ZAIAPIConfig;
