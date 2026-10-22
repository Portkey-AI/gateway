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
        // Legacy Jurassic-style completion endpoint
        return `/${model}/complete`;
      }
      case 'chatComplete': {
        // Jamba chat uses the OpenAI-compatible Chat Completions API.
        // See https://docs.ai21.com/reference/jamba-1-6-api-ref
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
