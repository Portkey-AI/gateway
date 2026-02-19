import { Context } from 'hono';
import { PORTKEY_HEADER_KEYS } from '../middlewares/portkey/globals';
import { externalServiceFetch, internalServiceFetch } from '../utils/fetch';
import { Environment } from '../utils/env';

const ALBUS_BASEPATH = Environment({}).ALBUS_BASEPATH;
const isPrivateDeployment = Environment({}).PRIVATE_DEPLOYMENT === 'ON';

export const proxyAlbusRouteHandler = async (context: Context) => {
  const fetchOptions: Record<string, any> = {};
  fetchOptions['method'] = context.req.method;

  const headers = context.req.header();
  const apiKey = headers[PORTKEY_HEADER_KEYS.API_KEY];
  // Strip gateway endpoint for finetune service.
  const urlObject = new URL(context.req.url);
  const requestRoute = `${ALBUS_BASEPATH}${context.req.path}${urlObject.search}`;
  fetchOptions['headers'] = {
    Authorization: Environment({}).PORTKEY_CLIENT_AUTH,
    [PORTKEY_HEADER_KEYS.API_KEY]: apiKey,
    'content-type': 'application/json',
  };

  if (fetchOptions['method'] !== 'GET') {
    let body;
    try {
      body = await context.req.json();
    } catch {
      body = {};
    }
    fetchOptions['body'] = JSON.stringify(body);
  }

  return (isPrivateDeployment ? internalServiceFetch : externalServiceFetch)(
    requestRoute,
    fetchOptions
  );
};
