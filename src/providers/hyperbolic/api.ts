import { ProviderAPIConfig } from '../types';

const HYPERBOLIC_API_URL = 'https://api.hyperbolic.xyz';

const HyperbolicAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => HYPERBOLIC_API_URL,
  headers: ({ providerOptions, fn }) => {
    const headersObj: Record<string, string> = {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
    return headersObj;
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/v1/chat/completions';
      case 'imageGenerate':
        return '/v1/image/generation';
      default:
        return '';
    }
  },
};

export default HyperbolicAPIConfig;
