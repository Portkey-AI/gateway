import { ProviderAPIConfig } from '../types';

const AnthropicAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.anthropic.com/v1',
  headers: ({ providerOptions, fn }) => {
    const headers: Record<string, string> = {
      'X-API-Key': `${providerOptions.apiKey}`,
      'anthropic-version': '2023-06-01',
    };
    if (fn === 'chatComplete') {
      headers['anthropic-beta'] = 'messages-2023-12-15';
    }
    return headers;
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'complete':
        return '/complete';
      case 'chatComplete':
        return '/messages';
      default:
        return '';
    }
  },
};

export default AnthropicAPIConfig;
