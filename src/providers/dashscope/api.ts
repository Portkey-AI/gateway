import { ProviderAPIConfig } from '../types';

export const dashscopeAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://dashscope.aliyuncs.com',
  headers({ providerOptions }) {
    const { apiKey } = providerOptions;
    return { Authorization: `Bearer ${apiKey}` };
  },
  getEndpoint({ fn }) {
    switch (fn) {
      case 'chatComplete':
        return `/compatible-mode/v1/chat/completions`;
      case 'embed':
        return `/compatible-mode/v1/embeddings`;
      case 'rerank':
        return `/api/v1/services/rerank/text-rerank/text-rerank`;
      default:
        return '';
    }
  },
};
