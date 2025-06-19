import { ContentType } from '../../types/requestBody';
import { ProviderAPIConfig } from '../types';

// Default version if not specified in providerOptions
const DEFAULT_API_VERSION = '2024-07-07'; // Use a recent, valid version

const IBMWatsonXAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    const region = providerOptions.region || 'us-south';
    return `https://${region}.ml.cloud.ibm.com`;
  },
  headers: ({ providerOptions, fn, params }) => {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${providerOptions.apiKey}`,
      'Content-Type': 'application/json',
    };
    if (fn === 'chatComplete' && params?.stream) {
      headers['Accept'] = 'text/event-stream';
    } else {
      headers['Accept'] = 'application/json';
    }
    return headers;
  },
  getEndpoint: ({ fn, params, providerOptions }) => {
    const apiVersion = providerOptions.watsonxApiVersion || DEFAULT_API_VERSION;
    switch (fn) {
      case 'chatComplete':
        if (params?.stream) {
          return `/ml/v1/text/chat_stream?version=${apiVersion}`;
        }
        return `/ml/v1/text/chat?version=${apiVersion}`;
      default:
        return '';
    }
  },
};

export default IBMWatsonXAIAPIConfig;