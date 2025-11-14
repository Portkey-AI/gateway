import { ProviderAPIConfig } from '../types';

export const ModalAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => `https://api.modal.com/v1`, // This would ideally always be replaced by a custom host
  headers({ providerOptions }) {
    const { apiKey } = providerOptions;
    const headers =
      apiKey && apiKey.length > 0 ? { Authorization: `Bearer ${apiKey}` } : {};
    // When API key is not provided, custom headers for `model-key` and `model-secret` will be used.
    return headers;
  },
  getEndpoint({ fn }) {
    switch (fn) {
      case 'chatComplete': {
        return '/chat/completions';
      }
      default:
        return '';
    }
  },
};
