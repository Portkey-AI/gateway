import { ProviderAPIConfig } from '../types';

const AnthropicAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.anthropic.com/v1',
  headers: ({ providerOptions, fn, gatewayRequestBody }) => {
    const headers: Record<string, string> = {
      'X-API-Key': `${providerOptions.apiKey}`,
    };

    // Accept anthropic_beta and anthropic_version in body to support enviroments which cannot send it in headers.
    const betaHeader =
      providerOptions?.['anthropicBeta'] ??
      gatewayRequestBody?.['anthropic_beta'] ??
      'messages-2023-12-15';
    const version =
      providerOptions?.['anthropicVersion'] ??
      gatewayRequestBody?.['anthropic_version'] ??
      '2023-06-01';

    if (fn === 'chatComplete') {
      headers['anthropic-beta'] = betaHeader;
    }
    headers['anthropic-version'] = version;
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
