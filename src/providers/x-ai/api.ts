import { ProviderAPIConfig } from '../types';

const XAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.x.ai/v1',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      case 'complete':
        return '/completions';
      case 'embed':
        return '/embeddings';
      case 'realtime':
        // xAI realtime API uses a fixed endpoint with default model
        // See: https://docs.x.ai/docs/guides/voice/agent
        return '/realtime';
      case 'createModelResponse':
        return '/responses';
      default:
        return '';
    }
  },
};

export default XAIAPIConfig;
