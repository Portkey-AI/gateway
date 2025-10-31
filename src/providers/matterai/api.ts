import { ProviderAPIConfig } from '../types';

const DEFAULT_MATTERAI_BASE_URL = 'https://api.matterai.so/v1';

const MatterAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => DEFAULT_MATTERAI_BASE_URL,
  headers: ({ providerOptions }) => {
    return {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
      case 'stream-chatComplete':
        return '/chat/completions';
      default:
        return '';
    }
  },
};

export default MatterAIAPIConfig;
