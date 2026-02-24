import { Context, Next } from 'hono';
import { PORTKEY_HEADER_KEYS } from '../middlewares/portkey/globals';
import { externalServiceFetch, internalServiceFetch } from '../utils/fetch';
import { Environment } from '../utils/env';
import { env } from 'hono/adapter';

export const modelsHandler = async (context: Context, next: Next) => {
  const fetchOptions: Record<string, any> = {};
  fetchOptions['method'] = context.req.method;

  const headers = context.get('mappedHeaders');

  const authHeader = headers['Authorization'] || headers['authorization'];

  const apiKey =
    headers[PORTKEY_HEADER_KEYS.API_KEY] || authHeader?.replace('Bearer ', '');
  let config: any = headers[PORTKEY_HEADER_KEYS.CONFIG];
  if (config && typeof config === 'string') {
    try {
      config = JSON.parse(config);
    } catch {
      config = {};
    }
  }
  const providerHeader = headers[PORTKEY_HEADER_KEYS.PROVIDER];
  const virtualKey = headers[PORTKEY_HEADER_KEYS.VIRTUAL_KEY];

  const containsProvider =
    providerHeader ||
    virtualKey ||
    config?.provider ||
    config?.virtual_key ||
    config?.targets;

  if (containsProvider) {
    return next();
  }
  const finalEnv = Environment(env(context));
  // Strip gateway endpoint for finetune service.
  const urlObject = new URL(context.req.url);
  const requestRoute = `${finalEnv.ALBUS_BASEPATH}${context.req.path.replace('/v1/', '/v2/')}${urlObject.search}`;
  fetchOptions['headers'] = {
    [PORTKEY_HEADER_KEYS.API_KEY]: apiKey,
  };
  const resp = await (
    finalEnv.PRIVATE_DEPLOYMENT === 'ON'
      ? internalServiceFetch
      : externalServiceFetch
  )(requestRoute, fetchOptions);
  return new Response(resp.body, {
    status: resp.status,
    headers: {
      'content-type': 'application/json',
    },
  });
};
