import { ProviderAPIConfig } from '../types';

const TritonAPIConfig: ProviderAPIConfig = {
  headers: () => {
    return {};
  },
  getBaseURL: ({ providerOptions }) => {
    return providerOptions.customHost ?? '';
  },
  getEndpoint: ({ fn, providerOptions }) => {
    let mappedFn = fn;
    switch (mappedFn) {
      case 'complete': {
        return `/generate`;
      }
      case 'chatComplete': {
        return `/v1/chat/completions`;
      }
      case 'embed': {
        return `/v1/embeddings`;
      }
      default:
        return '';
    }
  },
};

export default TritonAPIConfig;
