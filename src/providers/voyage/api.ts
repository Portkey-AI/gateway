import { ProviderAPIConfig } from '../types';

const VoyageAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.voyageai.com/v1',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'embed':
        return '/embeddings';
      case 'multimodalEmbed':
        return '/multimodalembeddings';
      case 'rerank':
        return '/rerank';
      default:
        return '';
    }
  },
};

export default VoyageAPIConfig;
