import { ProviderAPIConfig } from '../types';

const GroqAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.groq.com/openai/v1',
  headers: ({ providerOptions, fn }) => {
    const headersObj: Record<string, string> = {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
    if (fn === 'createTranscription' || fn === 'createTranslation')
      headersObj['Content-Type'] = 'multipart/form-data';
    return headersObj;
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      case 'createTranscription':
        return '/audio/transcriptions';
      case 'createTranslation':
        return '/audio/translations';
      case 'createSpeech':
        return '/audio/speech';
      case 'createModelResponse':
        return '/chat/completions';
      default:
        return '';
    }
  },
};

export default GroqAPIConfig;
