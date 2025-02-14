import { ProviderAPIConfig } from '../types';

const OpenAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.openai.com/v1',
  headers: ({ providerOptions, fn }) => {
    const headersObj: Record<string, string> = {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
    if (providerOptions.openaiOrganization) {
      headersObj['OpenAI-Organization'] = providerOptions.openaiOrganization;
    }

    if (providerOptions.openaiProject) {
      headersObj['OpenAI-Project'] = providerOptions.openaiProject;
    }

    if (
      fn === 'createTranscription' ||
      fn === 'createTranslation' ||
      fn === 'uploadFile'
    )
      headersObj['Content-Type'] = 'multipart/form-data';

    if (providerOptions.openaiBeta) {
      headersObj['OpenAI-Beta'] = providerOptions.openaiBeta;
    }

    return headersObj;
  },
  getEndpoint: ({ fn, gatewayRequestURL }) => {
    const basePath = gatewayRequestURL.split('/v1')?.[1];
    switch (fn) {
      case 'complete':
        return '/completions';
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
      case 'createTranslation':
        return '/audio/translations';
      case 'realtime':
        return basePath;
      case 'uploadFile':
        return basePath;
      case 'retrieveFile':
        return basePath;
      case 'listFiles':
        return basePath;
      case 'deleteFile':
        return basePath;
      case 'retrieveFileContent':
        return basePath;
      case 'createBatch':
        return basePath;
      case 'createFinetune':
        return basePath;
      case 'retrieveFinetune':
        return basePath;
      case 'listFinetunes':
        return basePath;
      case 'cancelFinetune':
        return basePath;
      case 'retrieveBatch':
        return basePath;
      case 'cancelBatch':
        return basePath;
      case 'listBatches':
        return basePath;
      default:
        return '';
    }
  },
};

export default OpenAIAPIConfig;
