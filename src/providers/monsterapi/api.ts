import { ProviderAPIConfig } from '../types';

const MonsterAPIApiConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://llm.monsterapi.ai/v1',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'generate':
        return '/generate';
      default:
        return '/generate';
    }
  },
};

export default MonsterAPIApiConfig;
