import { ProviderAPIConfig } from '../types';

const StabilityAIAPIConfig: ProviderAPIConfig = {
  baseURL: 'https://api.stability.ai/v1',
  headers: (API_KEY: string) => {
    return { Authorization: `Bearer ${API_KEY}` };
  },
  getEndpoint: (fn: string, ENGINE_ID: string, url?: string) => {
    let mappedFn = fn;
    if (fn === 'proxy' && url && url?.indexOf('text-to-image') > -1) {
      mappedFn = 'imageGenerate';
    }

    switch (mappedFn) {
      case 'imageGenerate': {
        return `/generation/${ENGINE_ID}/text-to-image`;
      }
    }
  },
};

export default StabilityAIAPIConfig;
