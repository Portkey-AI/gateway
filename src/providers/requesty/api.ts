import { POWERED_BY } from '../../globals';
import { ProviderAPIConfig } from '../types';

const RequestyAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://router.requesty.ai',
  headers: ({ providerOptions }) => {
    return {
      Authorization: `Bearer ${providerOptions.apiKey}`, // https://app.requesty.ai/api-keys
      'HTTP-Referer': 'https://portkey.ai/',
      'X-Title': POWERED_BY,
    };
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

export default RequestyAPIConfig;
