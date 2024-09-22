import { ProviderAPIConfig } from '../types';

const MistralAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.mistral.ai/v1',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn, providerOptions }) => {
    let mappedfn = fn;
    if (providerOptions.mistralFimCompletion === 'true') {
      mappedfn = 'fimComplete';
    }
    switch (mappedfn) {
      case 'chatComplete':
        return '/chat/completions';
      case 'embed':
        return '/embeddings';
      case 'fimComplete':
        return '/fim/completions';
      default:
        return '';
    }
  },
};

export default MistralAIAPIConfig;
