import { ProviderAPIConfig } from '../types';

const MartianAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    return (
      providerOptions.martianBaseUrl || 'https://withmartian.com/api/openai/v1'
    );
  },
  headers: ({ providerOptions }) => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${providerOptions.apiKey}`,
  }),
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      default:
        return '';
    }
  },
};

export default MartianAPIConfig;
