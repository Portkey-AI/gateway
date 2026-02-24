import { ProviderAPIConfig } from '../types';

const JinaAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.jina.ai/v1',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'embed':
        return '/embeddings';
      case 'rerank':
        return '/rerank';
      default:
        return '';
    }
  },
};

export default JinaAPIConfig;
