import { ProviderAPIConfig } from '../types';

const DEFAULT_HPC_AI_BASE_URL = 'https://api.hpc-ai.com/inference/v1';

const HpcAiApiConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    const fromEnv =
      typeof process !== 'undefined' && process.env?.HPC_AI_BASE_URL
        ? process.env.HPC_AI_BASE_URL
        : '';
    return providerOptions.customHost || fromEnv || DEFAULT_HPC_AI_BASE_URL;
  },
  headers: ({ providerOptions }) => {
    return {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
      case 'stream-chatComplete':
        return '/chat/completions';
      default:
        return '';
    }
  },
};

export default HpcAiApiConfig;
