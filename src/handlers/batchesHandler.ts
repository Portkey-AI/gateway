import { Context } from 'hono';
import { tryTargetsRecursively } from './handlerUtils';
import { constructConfigFromRequestHeaders } from '../utils/request';
import { endpointStrings } from '../providers/types';
import { logger } from '../apm';

function batchesHandler(endpoint: endpointStrings, method: 'POST' | 'GET') {
  async function handler(c: Context): Promise<Response> {
    try {
      const requestHeaders = c.get('mappedHeaders');
      const request =
        endpoint === 'createBatch' ? c.get('requestBodyData').bodyJSON : {};
      const camelCaseConfig = constructConfigFromRequestHeaders(requestHeaders);
      if (endpoint === 'createBatch') {
        camelCaseConfig.defaultOutputGuardrails = [
          ...(camelCaseConfig.defaultOutputGuardrails || []),
          {
            id: 'portkey-dataservice',
            'portkey.dataservice': {
              is_enabled: true,
              id: 'portkey.dataservice',
            },
            async: false,
            deny: false,
            // eventType: 'afterRequestHook',
          } as any,
        ];
      }
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
      logger.error({ message: `${endpoint} error ${err.message}` });
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
