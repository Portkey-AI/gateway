import { ProviderAPIConfig } from '../types';

const WebWrightAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://webwright.ai/v1',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
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

export default WebWrightAPIConfig;
