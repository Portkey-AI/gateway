import { ProviderAPIConfig } from '../types'

const CozeAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.coze.com/open_api/v2',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${(providerOptions.apiKey || "").split(" ")[1]}` };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'complete':
        return '/chat';
      case 'chatComplete':
        return '/chat';
      default:
        return '';
    }
  },
}

export default CozeAPIConfig;
