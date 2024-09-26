import { ProviderAPIConfig } from '../types';

const LemonfoxAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.lemonfox.ai/v1',
  headers: ({ providerOptions, fn }) => {
    const headersObj: Record<string, string> = {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
    if (fn === 'createTranscription')
      headersObj['content-type'] = 'multipart/form-data';
    return headersObj;
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
