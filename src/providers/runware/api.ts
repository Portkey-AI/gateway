import { ProviderAPIConfig } from '../types';

export const RunwareAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.runware.ai/v1',
  headers({ providerOptions }) {
    const { apiKey } = providerOptions;
    return { Authorization: `Bearer ${apiKey}` };
  },
  getEndpoint({ fn }) {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      default:
        return '';
    }
  },
};
