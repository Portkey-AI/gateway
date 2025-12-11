import { ProviderAPIConfig } from '../types';

const IOIntelligenceAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.intelligence.io.solutions/api/v1',
  headers: ({ providerOptions }) => {
    const headersObj: Record<string, string> = {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
    return headersObj;
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      case 'embed':
        return '/embeddings';
      case 'createModelResponse':
        return '/chat/completions';
      default:
        return '';
    }
  },
};

export default IOIntelligenceAPIConfig;
