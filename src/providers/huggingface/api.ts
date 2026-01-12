import { ProviderAPIConfig } from '../types';
import { HF_ROUTER_BASE_URL } from './constants';
import { isHFImageModel } from './utils';

const HuggingfaceAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    return providerOptions.huggingfaceBaseUrl || HF_ROUTER_BASE_URL;
  },

  headers: ({ providerOptions }) => ({
    Authorization: `Bearer ${providerOptions.apiKey}`,
    'Content-Type': 'application/json',
  }),

  getEndpoint: ({ fn, gatewayRequestBodyJSON, providerOptions }) => {
    const { model } = gatewayRequestBodyJSON;

    const hasDedicatedEndpoint = Boolean(providerOptions.huggingfaceBaseUrl);
    const modelPath = hasDedicatedEndpoint ? '' : `/models/${model}`;

    switch (fn) {
      case 'chatComplete':
        return `${modelPath}/v1/chat/completions`;

      case 'complete':
        return `${modelPath}/v1/completions`;

      case 'imageGenerate': {
        // HF image models REQUIRE dedicated inference endpoints
        if (model && isHFImageModel(model) && !hasDedicatedEndpoint) {
          throw new Error(
            'HuggingFace image generation models require a dedicated inference endpoint. ' +
              'Set providerOptions.huggingfaceBaseUrl to your HF endpoint URL.'
          );
        }

        // Dedicated HF endpoints expect POST /
        if (hasDedicatedEndpoint) {
          return '';
        }

        // Legacy / serverless image models
        return `/models/${model}`;
      }
      default:
        return '';
    }
  },
};

export default HuggingfaceAPIConfig;
