import { ProviderAPIConfig } from '../types';

const PineconeAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => {
    // Pinecone requires a custom host for the index
    return 'https://api.pinecone.io';
  },
  headers: ({ providerOptions }) => {
    return {
      'Api-Key': providerOptions.apiKey || '',
      'Content-Type': 'application/json',
    };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'rerank':
        return '/rerank';
      default:
        return '';
    }
  },
};

export default PineconeAPIConfig;
