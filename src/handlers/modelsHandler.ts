import { Context, Next } from 'hono';
import { HEADER_KEYS } from '../globals';
import { env } from 'hono/adapter';

/**
 * Handles the models request. Returns a list of models supported by the Ai gateway.
 * Allows filters in query params for the provider
 * @param c - The Hono context
 * @returns - The response
 */
export const modelsHandler = async (context: Context, next: Next) => {
  const fetchOptions: Record<string, any> = {};
  fetchOptions['method'] = context.req.method;

  const controlPlaneURL = env(context).ALBUS_BASEPATH;

  const headers = Object.fromEntries(context.req.raw.headers);

  const authHeader = headers['Authorization'] || headers['authorization'];

  const apiKey =
    headers[HEADER_KEYS.API_KEY] || authHeader?.replace('Bearer ', '');
  let config: any = headers[HEADER_KEYS.CONFIG];
  if (config && typeof config === 'string') {
    try {
      config = JSON.parse(config);
    } catch {
      config = {};
    }
  }
  const providerHeader = headers[HEADER_KEYS.PROVIDER];
  const virtualKey = headers[HEADER_KEYS.VIRTUAL_KEY];

  const containsProvider =
    providerHeader || virtualKey || config?.provider || config?.virtual_key;

  if (containsProvider || !controlPlaneURL) {
    return next();
  }

  // Strip gateway endpoint for models endpoint.
  const urlObject = new URL(context.req.url);
  const requestRoute = `${controlPlaneURL}${context.req.path.replace('/v1/', '/v2/')}${urlObject.search}`;
  fetchOptions['headers'] = {
    [HEADER_KEYS.API_KEY]: apiKey,
  };

  const resp = await fetch(requestRoute, fetchOptions);
  return new Response(resp.body, {
    status: resp.status,
    headers: {
      'content-type': 'application/json',
    },
  });
};
