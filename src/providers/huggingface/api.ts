import { ProviderAPIConfig } from '../types';

const HuggingFaceAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    return (
      providerOptions.huggingFaceBaseUrl ||
      'https://api-inference.huggingface.co'
    );
  },
  headers: ({ providerOptions }) => ({
    Authorization: `Bearer ${providerOptions.apiKey}`,
  }),
  getEndpoint: ({ fn, gatewayRequestBody, providerOptions }) => {
    const { model } = gatewayRequestBody;
    const modelPath = providerOptions.huggingFaceBaseUrl
      ? ''
      : `/models/${model}`;
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
