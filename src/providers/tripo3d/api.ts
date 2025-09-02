import { ProviderAPIConfig } from '../types';

const Tripo3DAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.tripo3d.ai/v2/openapi',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ gatewayRequestURL }) => {
    // For passthrough proxy, extract path after /v1
    return gatewayRequestURL.split('/v1')[1] || '';
  },
};

export default Tripo3DAPIConfig;
