import { ProviderAPIConfig } from '../types';

const EmpirioLabsAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.empiriolabs.ai/v1',
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
      case 'embed':
        return '/embeddings';
      case 'imageGenerate':
        return '/images/generations';
      case 'createSpeech':
        return '/audio/speech';
      case 'createTranscription':
        return '/audio/transcriptions';
      default:
        return '';
    }
  },
};

export default EmpirioLabsAPIConfig;
