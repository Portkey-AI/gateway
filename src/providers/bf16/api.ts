import { ProviderAPIConfig } from '../types';

const DEFAULT_BF16_BASE_URL = 'https://api.bf16.ai/v1';

const BF16APIConfig: ProviderAPIConfig = {
  getBaseURL: () => DEFAULT_BF16_BASE_URL,
  headers: ({ providerOptions }) => {
    const { apiKey } = providerOptions;
    return {
      Authorization: `Bearer ${apiKey}`,
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

export default BF16APIConfig;
