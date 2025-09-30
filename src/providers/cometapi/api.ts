import { ProviderAPIConfig } from '../types';

const DEFAULT_COMETAPI_BASE_URL = 'https://api.cometapi.com/v1';

const CometAPIAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => DEFAULT_COMETAPI_BASE_URL,
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
      case 'embed':
        return '/embeddings';
      default:
        return '';
    }
  },
};

export default CometAPIAPIConfig;
