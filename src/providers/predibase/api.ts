import { ProviderAPIConfig } from '../types';

const PredibaseAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://serving.app.predibase.com',
  headers: ({ providerOptions }) => {
    return {
      Authorization: `Bearer ${providerOptions.apiKey}`,
      Accept: 'application/json',
    };
  },
  getEndpoint: ({ fn, gatewayRequestBody }) => {
    const user = gatewayRequestBody?.user;
    const model = gatewayRequestBody?.model;
    switch (fn) {
      case 'chatComplete':
        return `/${user}/deployments/v2/llms/${model}/v1/chat/completions`;
      default:
        return '';
    }
  },
};

export default PredibaseAPIConfig;
