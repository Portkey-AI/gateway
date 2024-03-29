import { ProviderAPIConfig } from '../types';

// Good reference for using REST: https://cloud.google.com/vertex-ai/generative-ai/docs/start/quickstarts/quickstart-multimodal#gemini-beginner-samples-drest
// Difference versus Studio AI: https://cloud.google.com/vertex-ai/docs/start/ai-platform-users
export const GoogleApiConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    const { vertexProjectId, vertexRegion } = providerOptions;

    return `https://${vertexRegion}-aiplatform.googleapis.com/v1/projects/${vertexProjectId}/locations/${vertexRegion}/publishers/google`;
  },
  headers: ({ providerOptions }) => {
    const { apiKey } = providerOptions;

    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
  },
  getEndpoint: ({ fn, gatewayRequestBody }) => {
    let mappedFn = fn;
    const { model, stream } = gatewayRequestBody;
    if (stream) {
      mappedFn = `stream-${fn}`;
    }
    switch (mappedFn) {
      case 'chatComplete': {
        return `/models/${model}:generateContent`;
      }
      case 'stream-chatComplete': {
        return `/models/${model}:streamGenerateContent`;
      }

      // Embed API is not yet implemented in the gateway
      // This may be as easy as copy-paste from Google provider, but needs to be tested

      default:
        return '';
    }
  },
};

export default GoogleApiConfig;
