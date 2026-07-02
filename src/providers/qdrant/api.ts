import { ProviderAPIConfig } from '../types';

const QdrantAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    return providerOptions.customHost || '';
  },
  headers: ({ providerOptions }) => {
    return { 'api-key': `${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      default:
        return '';
    }
  },
};

export default QdrantAPIConfig;
