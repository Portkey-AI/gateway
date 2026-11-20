import { ProviderAPIConfig } from '../types';

const DEFAULT_SARVAM_BASE_URL = 'https://api.sarvam.ai/v2';

const SarvamAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) =>
    providerOptions.customHost || DEFAULT_SARVAM_BASE_URL,
  headers: ({ providerOptions }) => {
    return {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      case 'createModelResponse':
        return '/responses';
      default:
        return '';
    }
  },
};

export default SarvamAPIConfig;
