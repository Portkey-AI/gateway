import { ProviderAPIConfig } from '../types';

const AI21APIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.ai21.com/studio/v1',
  headers: ({ providerOptions }) => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
    return headers;
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete': {
        return `/chat/completions`;
      }
      default:
        return '';
    }
  },
};

export default AI21APIConfig;
