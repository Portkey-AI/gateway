import { POWERED_BY } from '../../globals';
import { ProviderAPIConfig } from '../types';

const OpenrouterAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://openrouter.ai/api',
  headers: ({ providerOptions }) => {
    return {
      Authorization: `Bearer ${providerOptions.apiKey}`, // https://openrouter.ai/keys
      'HTTP-Referer': 'https://portkey.ai/',
      'X-Title': POWERED_BY,
    };
  },
  getEndpoint: ({ fn, gatewayRequestURL }) => {
    const basePath = gatewayRequestURL.split('/v1')?.[1];
    switch (fn) {
      case 'chatComplete':
        return '/v1/chat/completions';
      case 'createModelResponse':
        return '/v1' + basePath;
      case 'getModelResponse':
        return '/v1' + basePath;
      case 'deleteModelResponse':
        return '/v1' + basePath;
      case 'listResponseInputItems':
        return '/v1' + basePath;
      default:
        return '';
    }
  },
};

export default OpenrouterAPIConfig;
