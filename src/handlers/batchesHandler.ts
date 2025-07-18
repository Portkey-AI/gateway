import { Context } from 'hono';
import {
  constructConfigFromRequestHeaders,
  tryTargetsRecursively,
} from './handlerUtils';
import { endpointStrings } from '../providers/types';
import { logger } from '../apm';

function batchesHandler(endpoint: endpointStrings, method: 'POST' | 'GET') {
  async function handler(c: Context): Promise<Response> {
    try {
      const requestHeaders = Object.fromEntries(c.req.raw.headers);
      const request = endpoint === 'createBatch' ? await c.req.json() : {};
      const camelCaseConfig = constructConfigFromRequestHeaders(requestHeaders);
      const tryTargetsResponse = await tryTargetsRecursively(
        c,
        camelCaseConfig ?? {},
        request,
        requestHeaders,
        endpoint,
        method,
        'config'
      );

      return tryTargetsResponse;
    } catch (err: any) {
      logger.error('batchesHandler error: ', err);
      return new Response(
        JSON.stringify({
          status: 'failure',
          message: 'Something went wrong',
        }),
        {
          status: 500,
          headers: {
            'content-type': 'application/json',
          },
        }
      );
    }
  }
  return handler;
}

export default batchesHandler;
