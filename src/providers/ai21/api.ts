import { ProviderAPIConfig } from '../types';

const AI21APIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.ai21.com/studio/v1',
  headers: ({ providerOptions }) => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
    return headers;
  },
  getEndpoint: ({ fn, gatewayRequestBodyJSON }) => {
    const { model } = gatewayRequestBodyJSON;
    switch (fn) {
      case 'complete': {
        // Legacy Jurassic-2 models use the model-specific completion endpoint
        return `/${model}/complete`;
      }
      case 'chatComplete': {
        // Jamba models (jamba-1.5-*, jamba-1.6-*, jamba-instruct, etc.)
        // use the OpenAI-compatible /chat/completions endpoint.
        // Reference: https://docs.ai21.com/reference/jamba-1-6-api-ref
        return `/chat/completions`;
      }
      case 'embed': {
        return `/embed`;
      }
      default:
        return '';
    }
  },
};

export default AI21APIConfig;
