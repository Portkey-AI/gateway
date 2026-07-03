/**
 * @file src/providers/valkey-search/api.ts
 * Provider API config for the valkey-search provider.
 *
 * This provider uses the requestHandlers pattern (native RESP commands via
 * valkey-glide) rather than HTTP proxying, so getBaseURL and getEndpoint are
 * stubs - they are never called for endpoints that have a requestHandler.
 */
import { ProviderAPIConfig } from '../types';

const ValkeySearchAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    // customHost is the Valkey server address, e.g. "my-valkey.cache.amazonaws.com:6379"
    return providerOptions.customHost || '';
  },
  headers: () => {
    // No HTTP headers needed - GLIDE communicates over RESP protocol
    return {};
  },
  getEndpoint: () => {
    // All routing is handled via requestHandlers; this stub is required by the interface
    return '';
  },
};

export default ValkeySearchAPIConfig;
