import { ProviderAPIConfig } from '../types';
import { getModelAndProvider } from './utils';
import { getAccessToken } from './utils';

// Good reference for using REST: https://cloud.google.com/vertex-ai/generative-ai/docs/start/quickstarts/quickstart-multimodal#gemini-beginner-samples-drest
// Difference versus Studio AI: https://cloud.google.com/vertex-ai/docs/start/ai-platform-users
export const GoogleApiConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    const {
      vertexProjectId: inputProjectId,
      vertexRegion,
      vertexServiceAccountJson,
    } = providerOptions;
    let projectId = inputProjectId;
    if (vertexServiceAccountJson) {
      projectId = vertexServiceAccountJson.project_id;
    }

    return `https://${vertexRegion}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${vertexRegion}`;
  },
  headers: async ({ providerOptions }) => {
    const { apiKey, vertexServiceAccountJson } = providerOptions;
    let authToken = apiKey;
    if (vertexServiceAccountJson) {
      authToken = await getAccessToken(vertexServiceAccountJson);
    }

    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    };
  },
  getEndpoint: ({ fn, gatewayRequestBody }) => {
    let mappedFn = fn;
    const { model: inputModel, stream } = gatewayRequestBody;
    if (stream) {
      mappedFn = `stream-${fn}`;
    }

    const { provider, model } = getModelAndProvider(inputModel as string);

    switch (provider) {
      case 'google': {
        if (mappedFn === 'chatComplete') {
          return `/publishers/${provider}/models/${model}:generateContent`;
        } else if (mappedFn === 'stream-chatComplete') {
          return `/publishers/${provider}/models/${model}:streamGenerateContent?alt=sse`;
        }
      }

      case 'anthropic': {
        if (mappedFn === 'chatComplete') {
          return `/publishers/${provider}/models/${model}:rawPredict`;
        } else if (mappedFn === 'stream-chatComplete') {
          return `/publishers/${provider}/models/${model}:streamRawPredict`;
        }
      }

      // Embed API is not yet implemented in the gateway
      // This may be as easy as copy-paste from Google provider, but needs to be tested
      default:
        return '';
    }
  },
};

export default GoogleApiConfig;
