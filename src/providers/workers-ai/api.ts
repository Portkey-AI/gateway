import { ProviderAPIConfig } from '../types';

const WorkersAiAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions, fn }) => {
    const { workersAiAccountId } = providerOptions;
    if (fn === 'chatComplete') {
      return `https://api.cloudflare.com/client/v4/accounts/${workersAiAccountId}/ai/v1`;
    }
    return `https://api.cloudflare.com/client/v4/accounts/${workersAiAccountId}/ai/run`;
  },
  headers: ({ providerOptions }) => {
    const { apiKey } = providerOptions;
    return { Authorization: `Bearer ${apiKey}` };
  },
  getEndpoint: ({ fn, gatewayRequestBodyJSON: params }) => {
    const { model } = params;
    switch (fn) {
      case 'complete': {
        return `/${model}`;
      }
      case 'chatComplete': {
        return '/chat/completions';
      }
      case 'embed': {
        return `/${model}`;
      }
      case 'imageGenerate': {
        return `/${model}`;
      }
      default:
        return '';
    }
  },
};

export default WorkersAiAPIConfig;
