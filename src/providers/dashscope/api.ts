import { ProviderAPIConfig } from '../types';

export const dashscopeAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  headers({ providerOptions }) {
    const { apiKey } = providerOptions;
    return { Authorization: `Bearer ${apiKey}` };
  },
  getEndpoint({ fn }) {
    switch (fn) {
      case 'chatComplete':
        return `/chat/completions`;
      case 'embed':
        return `/embeddings`;
      default:
        return '';
    }
  },
};
