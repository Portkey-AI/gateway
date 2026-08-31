import { ProviderAPIConfig } from '../types';

// iFLYTEK Spark exposes an OpenAI-compatible HTTP API.
// Docs: https://www.xfyun.cn/doc/spark/HTTP%E8%B0%83%E7%94%A8%E6%96%87%E6%A1%A3.html
const IFlytekAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://spark-api-open.xf-yun.com',
  headers: ({ providerOptions }) => {
    // The apiKey is the Spark "API Password" (APIPassword) from the console.
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/v1/chat/completions';
      default:
        return '';
    }
  },
};

export default IFlytekAPIConfig;
