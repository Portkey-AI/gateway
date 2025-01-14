import { ProviderAPIConfig } from '../types';

const SiliconFlowAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.siliconflow.cn/v1',
  headers: ({ providerOptions }) => {
    return {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
  },
  getEndpoint: ({ fn, gatewayRequestBodyJSON }) => {
    const { model = 'ByteDance/SDXL-Lightning' } = gatewayRequestBodyJSON;
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      case 'embed':
        return '/embeddings';
      case 'imageGenerate':
        return `/${model}/text-to-image`;
      default:
        return '';
    }
  },
};

export default SiliconFlowAPIConfig;
