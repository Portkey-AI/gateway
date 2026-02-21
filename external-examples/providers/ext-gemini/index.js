/**
 * External Google Gemini Provider
 *
 * A self-contained external provider that replicates Google's Gemini API interface.
 * Used to demonstrate external provider loading in Portkey Gateway.
 */

export const metadata = {
  name: 'ext-gemini',
  description: 'External Google Gemini provider for testing',
  version: '1.0.0',
};

// API Configuration
const api = {
  getBaseURL: ({ providerOptions }) => {
    return (
      providerOptions.baseURL || 'https://generativelanguage.googleapis.com'
    );
  },

  headers: () => {
    return { 'Content-Type': 'application/json' };
  },

  getEndpoint: ({ fn, providerOptions, gatewayRequestBodyJSON }) => {
    let routeVersion = 'v1beta';
    const { model, stream } = gatewayRequestBodyJSON || {};

    // Use v1alpha for thinking models
    if (model?.includes('gemini-2.0-flash-thinking-exp')) {
      routeVersion = 'v1alpha';
    }

    const { apiKey } = providerOptions;

    if (stream && fn === 'chatComplete') {
      return `/${routeVersion}/models/${model}:streamGenerateContent?key=${apiKey}`;
    }

    switch (fn) {
      case 'chatComplete':
        return `/${routeVersion}/models/${model}:generateContent?key=${apiKey}`;
      case 'embed':
        return `/${routeVersion}/models/${model}:embedContent?key=${apiKey}`;
      default:
        return '';
    }
  },
};

// Chat Completion Config
// Note: Google uses a different request format internally, but Portkey transforms it
const chatComplete = {
  model: { param: 'model', required: true, default: 'gemini-1.5-flash' },
  messages: { param: 'messages', required: true },
  max_tokens: { param: 'max_tokens' },
  max_completion_tokens: { param: 'max_completion_tokens' },
  temperature: { param: 'temperature', min: 0, max: 2 },
  top_p: { param: 'top_p' },
  top_k: { param: 'top_k' },
  stop: { param: 'stop' },
  stream: { param: 'stream', default: false },
  response_format: { param: 'response_format' },
  tools: { param: 'tools' },
  tool_choice: { param: 'tool_choice' },
  logprobs: { param: 'logprobs' },
  top_logprobs: { param: 'top_logprobs' },
  seed: { param: 'seed' },
};

// Embed Config
const embed = {
  model: { param: 'model', required: true, default: 'text-embedding-004' },
  input: { param: 'input', required: true },
};

// Export the provider config
export default {
  api,
  chatComplete,
  embed,
};
