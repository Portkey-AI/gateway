import { ProviderAPIConfig } from '../types';

const FrequencyAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://llm.scalefrequency.com/v2',
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

export default FrequencyAPIConfig;
