import { ProviderAPIConfig } from '../types';

const LlmtrAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://llmtr.com/v1',
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

export default LlmtrAPIConfig;
