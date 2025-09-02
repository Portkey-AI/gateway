import { ProviderAPIConfig } from '../types';

const Tripo3DAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.tripo3d.ai/v2/openapi',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ providerPath }) => {
    // For passthrough proxy, use the path directly
    return providerPath || '';
  },
};

export default Tripo3DAPIConfig;
