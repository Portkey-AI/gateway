import { ProviderAPIConfig } from '../types';

const LemonfoxAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.lemonfox.ai/v1',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      case 'imageGenerate':
        return '/images/generations';
      case 'createTranscription':
        return '/audio/transcriptions';
      default:
        return '';
    }
  },
};

export default LemonfoxAIAPIConfig;
