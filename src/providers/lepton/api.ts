import { ProviderAPIConfig } from '../types';

const LEPTON_API_URL = 'https://api.lepton.ai';

const LeptonAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => LEPTON_API_URL,
  headers: ({ providerOptions, fn }) => {
    const headersObj: Record<string, string> = {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };

    if (fn === 'createTranscription') {
      headersObj['Content-Type'] = 'multipart/form-data';
    }

    return headersObj;
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/api/v1/chat/completions';
      case 'complete':
        return '/api/v1/completions';
      case 'createTranscription':
        return '/api/v1/audio/transcriptions';
      default:
        return '';
    }
  },
};

export default LeptonAPIConfig;
