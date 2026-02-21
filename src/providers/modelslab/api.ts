import { ProviderAPIConfig } from '../types';

const ModelsLabAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://modelslab.com/api/v6',
  headers: () => {
    return { 'Content-Type': 'application/json' };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'imageGenerate':
        return '/images/text2img';
      default:
        return '';
    }
  },
};

export default ModelsLabAPIConfig;
