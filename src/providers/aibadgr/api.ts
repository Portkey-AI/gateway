import { ProviderAPIConfig } from '../types';

const AIBadgrAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://aibadgr.com/api/v1',
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

export default AIBadgrAPIConfig;
