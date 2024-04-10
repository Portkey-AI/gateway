import { ProviderAPIConfig } from '../types';

const ZhipuAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://open.bigmodel.cn/api/paas',
  headers: ({ providerOptions }) => {
    return { Authorization: `${providerOptions.apiKey}` }; // https://platform.moonshot.cn/console/api-keys
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/v4/chat/completions';
      default:
        return '';
    }
  },
};

export default ZhipuAPIConfig;
