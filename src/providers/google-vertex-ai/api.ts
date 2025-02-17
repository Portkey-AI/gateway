import { Options } from '../../types/requestBody';
import { endpointStrings, ProviderAPIConfig } from '../types';
import { getModelAndProvider, getAccessToken } from './utils';

const getApiVersion = (provider: string, inputModel: string) => {
  if (provider === 'meta') return 'v1beta1';
  return 'v1';
};

const getProjectRoute = (
  providerOptions: Options,
  inputModel: string
): string => {
  const {
    vertexProjectId: inputProjectId,
    vertexRegion,
    vertexServiceAccountJson,
  } = providerOptions;
  let projectId = inputProjectId;
  if (vertexServiceAccountJson) {
    projectId = vertexServiceAccountJson.project_id;
  }

  const { provider } = getModelAndProvider(inputModel as string);
  let routeVersion = getApiVersion(provider, inputModel as string);
  return `/${routeVersion}/projects/${projectId}/locations/${vertexRegion}`;
};

// Good reference for using REST: https://cloud.google.com/vertex-ai/generative-ai/docs/start/quickstarts/quickstart-multimodal#gemini-beginner-samples-drest
// Difference versus Studio AI: https://cloud.google.com/vertex-ai/docs/start/ai-platform-users
export const GoogleApiConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    const { vertexRegion } = providerOptions;

    return `https://${vertexRegion}-aiplatform.googleapis.com`;
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
  getEndpoint: ({ fn, gatewayRequestBodyJSON, providerOptions }) => {
    let mappedFn = fn;
    const { model: inputModel, stream } = gatewayRequestBodyJSON;
    if (stream) {
      mappedFn = `stream-${fn}` as endpointStrings;
    }

    const { provider, model } = getModelAndProvider(inputModel as string);
    const projectRoute = getProjectRoute(providerOptions, inputModel as string);
    const googleUrlMap = new Map<string, string>([
      [
        'chatComplete',
        `${projectRoute}/publishers/${provider}/models/${model}:generateContent`,
      ],
      [
        'stream-chatComplete',
        `${projectRoute}/publishers/${provider}/models/${model}:streamGenerateContent?alt=sse`,
      ],
      [
        'embed',
        `${projectRoute}/publishers/${provider}/models/${model}:predict`,
      ],
      [
        'imageGenerate',
        `${projectRoute}/publishers/${provider}/models/${model}:predict`,
      ],
    ]);

    switch (provider) {
      case 'google': {
        return googleUrlMap.get(mappedFn) || `${projectRoute}`;
      }

      case 'anthropic': {
        if (mappedFn === 'chatComplete') {
          return `${projectRoute}/publishers/${provider}/models/${model}:rawPredict`;
        } else if (mappedFn === 'stream-chatComplete') {
          return `${projectRoute}/publishers/${provider}/models/${model}:streamRawPredict`;
        }
      }

      case 'meta': {
        return `${projectRoute}/endpoints/openapi/chat/completions`;
      }

      case 'endpoints': {
        return `${projectRoute}/endpoints/${model}/chat/completions`;
      }

      default:
        return `${projectRoute}`;
    }
  },
};

export default GoogleApiConfig;
