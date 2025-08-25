import { ProviderAPIConfig } from '../types';

const MeshyAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ gatewayRequestURL }) => {
    const version = gatewayRequestURL.includes('text-to-3d') ? 'v2' : 'v1';
    return `https://api.meshy.ai/openapi/${version}`;
  },
  headers: ({ providerOptions }) => {
    return {
      Authorization: `Bearer ${providerOptions.apiKey}`,
      'Content-Type': 'application/json',
    };
  },
  getEndpoint: ({ fn, gatewayRequestURL }) => {
    const basePath = gatewayRequestURL.split('/v1')?.[1] ?? '';

    switch (fn) {
      case 'modelGenerate':
        return '/text-to-3d';
      default:
        return basePath || '';
    }
  },
};

export default MeshyAPIConfig;
