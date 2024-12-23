import { ProviderAPIConfig } from '../types';

const SegmindAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.segmind.com/v1',
  headers: ({ providerOptions }) => {
    return { 'x-api-key': `${providerOptions.apiKey}` };
  },
  getEndpoint: ({ gatewayRequestBody }) => {
    return `/${gatewayRequestBody.model}`;
  },
};

export default SegmindAIAPIConfig;
