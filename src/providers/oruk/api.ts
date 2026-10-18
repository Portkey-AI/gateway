import { ProviderAPIConfig } from '../types';

const OrukAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://qwen3-asr.oruk.ai/v1',
  headers: ({ providerOptions }) => {
    if (!providerOptions.apiKey) {
      throw new Error('An Oruk API key is required');
    }
    return {
      Authorization: `Bearer ${providerOptions.apiKey}`,
      'Content-Type': 'multipart/form-data',
    };
  },
  getEndpoint: ({ fn }) => {
    if (fn !== 'createTranscription') {
      throw new Error(`${fn} is not supported by oruk`);
    }
    return '/audio/transcriptions';
  },
};

export default OrukAPIConfig;
