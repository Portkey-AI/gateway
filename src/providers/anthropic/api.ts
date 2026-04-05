import { ProviderAPIConfig } from '../types';

const AnthropicAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.anthropic.com/v1',

  headers: ({ c, providerOptions, fn, gatewayRequestBody }) => {
    const apiKey =
      providerOptions.apiKey || providerOptions.anthropicApiKey || '';
    const headers: Record<string, string> = {
      'X-API-Key': apiKey,
    };

    // Accept anthropic_beta and anthropic_version in body to support enviroments which cannot send it in headers.
    // Also fall back to reading from the original request headers (via Hono context)
    // to handle targets-based configs where providerOptions may not include these.
    const betaHeader =
      providerOptions?.['anthropicBeta'] ??
      gatewayRequestBody?.['anthropic_beta'] ??
      c?.req?.header('anthropic-beta') ??
      'messages-2023-12-15';
    const version =
      providerOptions?.['anthropicVersion'] ??
      gatewayRequestBody?.['anthropic_version'] ??
      c?.req?.header('anthropic-version') ??
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
