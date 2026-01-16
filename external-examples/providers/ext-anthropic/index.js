/**
 * External Anthropic Provider
 *
 * A self-contained external provider that replicates Anthropic's API interface.
 * Used to demonstrate external provider loading in Portkey Gateway.
 */

export const metadata = {
  name: 'ext-anthropic',
  description: 'External Anthropic provider for testing',
  version: '1.0.0',
};

// API Configuration
const api = {
  getBaseURL: ({ providerOptions }) => {
    return providerOptions.baseURL || 'https://api.anthropic.com/v1';
  },

  headers: ({ providerOptions, fn, gatewayRequestBody }) => {
    const apiKey =
      providerOptions.apiKey || providerOptions.anthropicApiKey || '';
    const headers = {
      'X-API-Key': apiKey,
    };

    // Accept anthropic_beta and anthropic_version in body to support environments which cannot send it in headers
    const betaHeader =
      providerOptions?.anthropicBeta ??
      gatewayRequestBody?.anthropic_beta ??
      'messages-2023-12-15';
    const version =
      providerOptions?.anthropicVersion ??
      gatewayRequestBody?.anthropic_version ??
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
      case 'messages':
        return '/messages';
      case 'messagesCountTokens':
        return '/messages/count_tokens';
      default:
        return '';
    }
  },
};

// Chat Completion Config (Anthropic Messages API)
const chatComplete = {
  model: { param: 'model', required: true, default: 'claude-3-haiku-20240307' },
  messages: { param: 'messages', required: true },
  system: { param: 'system' },
  max_tokens: { param: 'max_tokens', required: true, default: 1024 },
  temperature: { param: 'temperature', default: 1, min: 0, max: 1 },
  top_p: { param: 'top_p' },
  top_k: { param: 'top_k' },
  stop_sequences: { param: 'stop_sequences' },
  stream: { param: 'stream', default: false },
  tools: { param: 'tools' },
  tool_choice: { param: 'tool_choice' },
  metadata: { param: 'metadata' },
};

// Legacy Completion Config
const complete = {
  model: { param: 'model', required: true },
  prompt: { param: 'prompt', required: true },
  max_tokens_to_sample: {
    param: 'max_tokens_to_sample',
    required: true,
    default: 1024,
  },
  temperature: { param: 'temperature', default: 1 },
  top_p: { param: 'top_p' },
  top_k: { param: 'top_k' },
  stop_sequences: { param: 'stop_sequences' },
  stream: { param: 'stream', default: false },
};

// Export the provider config
export default {
  api,
  chatComplete,
  complete,
};
