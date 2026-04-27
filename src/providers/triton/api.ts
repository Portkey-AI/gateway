import { ProviderAPIConfig } from '../types';

const TritonAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    return providerOptions.customHost ?? '';
  },
  headers: () => {
    return {};
  },
  getEndpoint: ({ fn, providerOptions, gatewayRequestBodyJSON }) => {
    const model = gatewayRequestBodyJSON?.model || '';
    switch (fn) {
      case 'complete': {
        return `/generate`;
      }
      case 'chatComplete': {
        return model ? `/v2/models/${model}/generate` : '/generate';
      }
      case 'embed': {
        return model ? `/v2/models/${model}/infer` : '';
      }
      default:
        return '';
    }
  },
};

export default TritonAPIConfig;
