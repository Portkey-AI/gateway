import { ProviderAPIConfig } from '../types';

export const VALAR_BASE_URL = 'https://api.valarhq.ai/v1';

const ValarAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => VALAR_BASE_URL,
  headers: ({ providerOptions, fn }) => {
    const headers: Record<string, string> = {
      // Valar accepts `Authorization: Bearer` on every surface, including the
      // Anthropic-compatible one, so a single auth header covers all endpoints.
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };

    // The completion window picks how much wall-clock time per turn is traded
    // for a lower rate. Valar reads it from `metadata.completion_window` first
    // and falls back to this header, which is the only route available when the
    // client owns the request body (the Claude Agent SDK, for instance).
    if (providerOptions.valarCompletionWindow) {
      headers['X-Valar-Completion-Window'] =
        providerOptions.valarCompletionWindow;
    }

    if (fn === 'uploadFile') {
      headers['Content-Type'] = 'multipart/form-data';
    }

    return headers;
  },
  getEndpoint: ({ fn, gatewayRequestURL }) => {
    const basePath = gatewayRequestURL.split('/v1')?.[1];
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      case 'messages':
        return '/messages';
      case 'messagesCountTokens':
        return '/messages/count_tokens';
      // The remaining endpoints keep the incoming path (it carries the file,
      // batch or response id) because Valar mirrors the OpenAI routes exactly.
      case 'createModelResponse':
      case 'getModelResponse':
      case 'uploadFile':
      case 'listFiles':
      case 'retrieveFile':
      case 'deleteFile':
      case 'retrieveFileContent':
      case 'createBatch':
      case 'retrieveBatch':
      case 'listBatches':
        return basePath;
      default:
        return '';
    }
  },
};

export default ValarAPIConfig;
