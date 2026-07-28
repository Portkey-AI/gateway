import { ProviderAPIConfig } from '../types';

const MODELSELL_BASE_URL = 'https://modelsell.com/v1';

const ModelsellAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => MODELSELL_BASE_URL,
  headers: ({ providerOptions }) => ({
    Authorization: `Bearer ${providerOptions.apiKey}`,
  }),
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
      case 'stream-chatComplete':
        return '/chat/completions';
      default:
        return '';
    }
  },
  getProxyEndpoint: ({ reqPath, reqQuery }) => `${reqPath}${reqQuery}`,
};

export default ModelsellAPIConfig;
