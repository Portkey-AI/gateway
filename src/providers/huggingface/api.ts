import { ProviderAPIConfig } from '../types';

const HuggingFaceAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api-inference.huggingface.co',
  headers: ({ providerOptions }) => ({
    Authorization: `Bearer ${providerOptions.apiKey}`,
  }),
  getEndpoint: ({ fn, gatewayRequestBody }) => {
    const { model } = gatewayRequestBody;
    const modelPath = `/models/${model}`;
    switch (fn) {
      case 'chatComplete':
        return `${modelPath}/v1/chat/completions`;
      case 'complete':
        return `${modelPath}/v1/completions`;
      default:
        return '';
    }
  },
};

export default HuggingFaceAPIConfig;
