import { ProviderAPIConfig } from '../types';

const WorkersAiAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    const { accountId } = providerOptions;
    return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run`;
  },
  headers: ({ providerOptions }) => {
    const { apiKey } = providerOptions;
    return { Authorization: `Bearer ${apiKey}` };
  },
  getEndpoint: ({ providerOptions, fn, gatewayRequestBody: params }) => {
    const { model } = params;
    switch (fn) {
      case 'complete': {
        return `/${model}`;
      }
      case 'chatComplete': {
        return `/${model}`;
      }
      default:
        return '';
    }
  },
};

export default WorkersAiAPIConfig;
