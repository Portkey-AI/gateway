/**
 * @file src/providers/valkey-search/index.ts
 * Valkey-search provider configuration.
 *
 * This provider uses native RESP commands via @valkey/valkey-glide (not HTTP
 * proxying). All six vector-search endpoints are wired via requestHandlers.
 */
import { ProviderConfigs, RequestHandler } from '../types';
import ValkeySearchAPIConfig from './api';
import {
  createIndexHandler,
  dropIndexHandler,
  getIndexHandler,
  upsertDocsHandler,
  searchIndexHandler,
  deleteDocsHandler,
} from './handlers';

/**
 * Single proxy handler that dispatches to the correct vector-search handler
 * based on HTTP method and URL path. The gateway routes all /v1/* wildcard
 * requests through the 'proxy' endpoint string.
 */
const proxyDispatcher: RequestHandler = async (ctx) => {
  const url = new URL(ctx.requestURL);
  const path = url.pathname;
  const method = ctx.c.req.method.toUpperCase();

  // POST /v1/indexes/:name/upsert
  if (method === 'POST' && /\/v1\/indexes\/[^/]+\/upsert$/.test(path)) {
    return upsertDocsHandler(ctx);
  }
  // POST /v1/indexes/:name/search
  if (method === 'POST' && /\/v1\/indexes\/[^/]+\/search$/.test(path)) {
    return searchIndexHandler(ctx);
  }
  // POST /v1/indexes/:name/documents/delete
  if (
    method === 'POST' &&
    /\/v1\/indexes\/[^/]+\/documents\/delete$/.test(path)
  ) {
    return deleteDocsHandler(ctx);
  }
  // GET /v1/indexes/:name
  if (method === 'GET' && /\/v1\/indexes\/[^/]+$/.test(path)) {
    return getIndexHandler(ctx);
  }
  // DELETE /v1/indexes/:name
  if (method === 'DELETE' && /\/v1\/indexes\/[^/]+$/.test(path)) {
    return dropIndexHandler(ctx);
  }
  // POST /v1/indexes
  if (method === 'POST' && /\/v1\/indexes\/?$/.test(path)) {
    return createIndexHandler(ctx);
  }

  return new Response(
    JSON.stringify({
      error: {
        message: `Unknown valkey-search route: ${method} ${path}`,
        type: 'invalid_request_error',
      },
    }),
    { status: 404, headers: { 'Content-Type': 'application/json' } }
  );
};

const ValkeySearchConfig: ProviderConfigs = {
  api: ValkeySearchAPIConfig,
  responseTransforms: {},
  requestHandlers: {
    proxy: proxyDispatcher,
  },
};

export default ValkeySearchConfig;
