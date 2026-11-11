import { ProviderAPIConfig } from '../types';

const FlexAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.flex.ai/v1',
  headers: ({ providerOptions, fn }) => {
    const headersObj: Record<string, string> = {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
    if (fn === 'createTranscription')
      headersObj['Content-Type'] = 'multipart/form-data';
    return headersObj;
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      case 'complete':
        return '/completions';
      case 'embed':
        return '/embeddings';
      case 'imageGenerate':
        return '/images/generations';
      case 'createTranscription':
        return '/audio/transcriptions';
      case 'createSpeech':
        return '/audio/speech';
      default:
        return '';
    }
  },
};

export default FlexAIAPIConfig;
