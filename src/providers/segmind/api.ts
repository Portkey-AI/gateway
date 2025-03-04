import { ProviderAPIConfig } from '../types';

const SegmindAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.segmind.com/v1',
  headers: ({ providerOptions }) => {
    return { 'x-api-key': `${providerOptions.apiKey}` };
  },
  getEndpoint: ({ gatewayRequestBodyJSON }) => {
    return `/${gatewayRequestBodyJSON.model}`;
  },
};

export default SegmindAIAPIConfig;
