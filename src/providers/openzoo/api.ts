import { ProviderAPIConfig } from '../types';

// OpenZoo's hosted gateway (https://api.openzoo.fun) answers
// POST /v1/chat/completions with 402 Payment Required unless the caller either
// pays over x402 or presents an OpenZoo subscription key of the form
// `ozk_live_...`. A hosted Portkey cannot pay x402, so the provider API key
// passed to Portkey MUST be an `ozk_live_` subscription key. GET /v1/models is
// free.
//
// Self-hosted Portkey users can instead run `npx openzoo` (npm `openzoo`): an
// OpenAI-compatible local proxy on http://localhost:8402 that pays each call
// over x402 from a local burner wallet and ignores the API key. Point
// `custom_host` at it (e.g. `http://localhost:8402`, or
// `http://host.docker.internal:8402` from a Docker-hosted Portkey); the
// `/v1/chat/completions` path is appended here.
export const OpenZooAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) =>
    providerOptions.customHost || 'https://api.openzoo.fun',
  headers({ providerOptions }) {
    const { apiKey } = providerOptions;
    const headers = {
      Authorization: `Bearer ${apiKey}`,
    };
    return headers;
  },
  getEndpoint({ fn }) {
    switch (fn) {
      case 'chatComplete': {
        return '/v1/chat/completions';
      }
      default:
        return '';
    }
  },
};
