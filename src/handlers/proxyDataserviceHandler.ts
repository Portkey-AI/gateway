import { Context } from 'hono';
import { getHeaders } from './datasets';
import { internalServiceFetch } from '../utils/fetch';
import { logger } from '../apm';
import { Environment } from '../utils/env';

const FINETUNE_SERVICE_BASE_URL = Environment({}).DATASERVICE_BASEPATH;

const shouldAppendAPIPrefix = (proxyPath: string) => {
  if (
    proxyPath.indexOf('/health') > -1 ||
    proxyPath.indexOf('/bull-board') > -1 ||
    proxyPath.indexOf('/metrics') > -1
  ) {
    return '';
  }
  return '/v1';
};

export async function proxyDataserviceHandler(c: Context) {
  // Strip gateway endpoint for finetune service.
  const proxyPath = c.req.path
    .replace('/v1/dataservice', '')
    .replace('/dataservice', '');
  const urlObject = new URL(c.req.url);
  const proxyRoute = `${FINETUNE_SERVICE_BASE_URL}${shouldAppendAPIPrefix(proxyPath)}${proxyPath}${urlObject.search}`;

  return internalServiceFetch(proxyRoute, {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: ['GET', 'HEAD'].includes(c.req.method)
      ? undefined
      : await c.req.arrayBuffer(),
  });
}

export async function proxyDataExportsHandler(c: Context) {
  const proxyPath = c.req.path;
  const urlObject = new URL(c.req.url);
  const proxyRoute = `${FINETUNE_SERVICE_BASE_URL}${proxyPath}${urlObject.search}`;
  let body;
  const request = c.get('requestBodyData');
  const requestHeaders = c.get('mappedHeaders');
  try {
    body =
      c.req.method === 'GET' || c.req.method === 'HEAD'
        ? undefined
        : c.req.raw.body
          ? request.bodyJSON
          : undefined;
  } catch (error) {
    logger.error('Error parsing request body:', error);
  }

  const fetchOptions = getHeaders(requestHeaders);

  return internalServiceFetch(proxyRoute, {
    method: c.req.method,
    ...fetchOptions,
    body: JSON.stringify(body),
  });
}
