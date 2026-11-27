import { ProviderAPIConfig } from '../types';

// Hubris (https://hubris.pro) is an OpenAI-compatible LLM gateway billed in
// Russian rubles. Model ids use the full `vendor/model` form from the catalog
// at https://hubris.pro/models, e.g. `anthropic/claude-sonnet-5`.
export const hubrisAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.hubris.pro/v1',
  headers({ providerOptions }) {
    const { apiKey } = providerOptions;
    return { Authorization: `Bearer ${apiKey}` };
  },
  getEndpoint({ fn }) {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      case 'embed':
        return '/embeddings';
      default:
        return '';
    }
  },
};
