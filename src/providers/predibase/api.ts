import { ProviderAPIConfig } from '../types';
import { splitString } from '../utils';

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
    const base_model = splitString(`${model}`, ':').before;
    switch (fn) {
      case 'chatComplete':
        // The Predibase model format is "<base_model>[:adapter_id]".
        return `/${user}/deployments/v2/llms/${base_model}/v1/chat/completions`;
      default:
        return '';
    }
  },
};

export default PredibaseAPIConfig;
