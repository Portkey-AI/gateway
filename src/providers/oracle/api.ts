import { ProviderAPIConfig } from '../types';

const OracleAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    // Oracle Generative AI Inference API base URL
    return `https://inference.generativeai.${providerOptions.oracleRegion}.oci.oraclecloud.com`;
  },
  headers: ({ providerOptions }) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (providerOptions.apiKey) {
      headers['Authorization'] = `Bearer ${providerOptions.apiKey}`;
    }

    return headers;
  },
  getEndpoint: ({ fn, providerOptions }) => {
    const { oracleApiVersion = '20231130' } = providerOptions;
    let endpoint = null;
    switch (fn) {
      case 'chatComplete':
      case 'stream-chatComplete':
        endpoint = '/actions/chat';
        break;
      default:
        return '';
    }
    return `${oracleApiVersion}${endpoint}`;
  },
};

export default OracleAPIConfig;
