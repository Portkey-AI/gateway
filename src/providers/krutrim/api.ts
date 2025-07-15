import { ProviderAPIConfig } from '../types';

const KrutrimAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://cloud.olakrutrim.com/v1',
  headers: ({ providerOptions, fn }) => {
    const headersObj: Record<string, string> = {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
    return headersObj;
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      default:
        return '';
    }
  },
};

export default KrutrimAPIConfig;
