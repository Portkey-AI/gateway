import { ProviderAPIConfig } from '../types';

const AstraflowAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api-us-ca.umodelverse.ai/v1',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      case 'complete':
        return '/completions';
      case 'embed':
        return '/embeddings';
      default:
        return '';
    }
  },
};

export default AstraflowAPIConfig;
