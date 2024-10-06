import { ProviderAPIConfig } from '../types';

const SiliconFlowAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.siliconflow.cn',
  headers: ({ providerOptions }) => {
    return {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
  },
  getEndpoint: ({ fn, gatewayRequestBody }) => {
    const { model = 'ByteDance/SDXL-Lightning' } = gatewayRequestBody;
    switch (fn) {
      case 'chatComplete':
        return '/v1/chat/completions';
      case 'embed':
        return '/v1/embeddings';
      case 'imageGenerate':
        return `/v1/${model}/text-to-image`;
      default:
        return '';
    }
  },
};

export default SiliconFlowAPIConfig;
