import { ProviderAPIConfig } from '../types';

const EmpirioLabsAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.empiriolabs.ai/v1',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      case 'embed':
        return '/embeddings';
      default:
        return '';
    }
  },
};

export default EmpirioLabsAPIConfig;
