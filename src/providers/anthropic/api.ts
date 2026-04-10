import { ProviderAPIConfig } from '../types';

const AnthropicAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.anthropic.com/v1',

  headers: ({ providerOptions, fn, gatewayRequestBody }) => {
    const apiKey =
      providerOptions.apiKey || providerOptions.anthropicApiKey || '';
    const headers: Record<string, string> = {};

    // Anthropic API keys start with 'sk-ant-' and must be sent as X-API-Key.
    // OAuth bearer tokens (e.g. Claude Max / enterprise SSO) must be sent as
    // Authorization: Bearer. Detect which scheme to use based on the key prefix.
    if (!apiKey || apiKey.startsWith('sk-ant-')) {
      headers['X-API-Key'] = apiKey;
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Accept anthropic_beta and anthropic_version in body to support enviroments which cannot send it in headers.
    const betaHeader =
      providerOptions?.['anthropicBeta'] ??
      gatewayRequestBody?.['anthropic_beta'] ??
      'messages-2023-12-15';
    const version =
      providerOptions?.['anthropicVersion'] ??
      gatewayRequestBody?.['anthropic_version'] ??
      '2023-06-01';

    headers['anthropic-beta'] = betaHeader;
    headers['anthropic-version'] = version;
    return headers;
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'complete':
        return '/complete';
      case 'chatComplete':
        return '/messages';
      case 'messages':
        return '/messages';
      case 'messagesCountTokens':
        return '/messages/count_tokens';
      default:
        return '';
    }
  },
};

export default AnthropicAPIConfig;
