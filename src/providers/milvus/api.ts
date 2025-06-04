import { ProviderAPIConfig } from '../types';

const MilvusAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    return providerOptions.customHost || '';
  },
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      default:
        return '';
    }
  },
};

export default MilvusAPIConfig;
