import { ProviderAPIConfig } from '../types';

const TokenLabAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.tokenlab.sh/v1',
  headers: ({ providerOptions }) => ({
    Authorization: `Bearer ${providerOptions.apiKey}`,
  }),
  getEndpoint: ({ fn, gatewayRequestURL }) => {
    const basePath = gatewayRequestURL.split('/v1')?.[1];
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      case 'createModelResponse':
      case 'getModelResponse':
      case 'deleteModelResponse':
      case 'listResponseInputItems':
        return basePath;
      default:
        return '';
    }
  },
};

export default TokenLabAPIConfig;
