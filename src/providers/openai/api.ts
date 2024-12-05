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
  getEndpoint: ({ fn, requestURL }) => {
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
        const endpoint = requestURL.split('/v1')[1];
        return endpoint;
      case 'uploadFile':
        return '/files';
      case 'retrieveFile':
        return requestURL.split('/v1')[1];
      case 'listFiles':
        return '/files';
      case 'deleteFile':
        return requestURL.split('/v1')[1];
      case 'retrieveFileContent':
        return requestURL.split('/v1')[1];
      case 'createBatch':
        return '/batches';
      case 'retrieveBatch':
        return requestURL.split('/v1')[1];
      case 'cancelBatch':
        return requestURL.split('/v1')[1];
      case 'listBatches':
        return requestURL.split('/v1')[1];
      default:
        return '';
    }
  },
};

export default OpenAIAPIConfig;
