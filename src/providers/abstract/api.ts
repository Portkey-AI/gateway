import { ProviderAPIConfig } from '../types';

const AbstractAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.abstract.inc/v1',
  headers: ({ providerOptions }) => {
    return {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
  },
  getEndpoint: ({ fn, gatewayRequestURL }) => {
    // Abstract serves its LLMs on the Responses API only.
    switch (fn) {
      case 'createModelResponse':
        return '/responses';
      case 'getModelResponse':
        return gatewayRequestURL.split('/v1')?.[1] ?? '';
      default:
        return '';
    }
  },
};

export default AbstractAPIConfig;
