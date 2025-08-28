import { ProviderAPIConfig } from '../types';

const Tripo3DAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.tripo3d.ai/v2/openapi',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'createTask':
        return '/task';
      case 'getTask':
        return '/task';
      case 'uploadFile':
        return '/upload';
      case 'getStsToken':
        return '/upload/sts/token';
      case 'getBalance':
        return '/user/balance';
      default:
        return '';
    }
  },
};

export default Tripo3DAPIConfig;
