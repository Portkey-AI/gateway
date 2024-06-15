import { ProviderAPIConfig } from '../types';

const ZeroOneAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.01ww.xyz/v1',
  headers: ({ providerOptions }) => {
    return {
      Authorization: `Bearer ${providerOptions.apiKey}`,
      'content-type': 'application/json',
    };
  },
  getEndpoint: () => '/chat/completions',
};

export default ZeroOneAIAPIConfig;
