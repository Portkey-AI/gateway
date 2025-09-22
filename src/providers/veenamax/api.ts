import { ProviderAPIConfig } from '../types';

const VeenaMaxAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://flash.mayaresearch.ai',
  headers: ({ providerOptions }) => {
    const headersObj: Record<string, string> = {
      Authorization: `Bearer ${providerOptions.apiKey}`,
      'Content-Type': 'application/json',
    };
    return headersObj;
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'createSpeech':
        return '/generate';
      default:
        return '';
    }
  },
};

export default VeenaMaxAPIConfig;
