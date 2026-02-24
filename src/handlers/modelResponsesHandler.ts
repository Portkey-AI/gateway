import { Context } from 'hono';
import { tryTargetsRecursively } from './handlerUtils';
import { constructConfigFromRequestHeaders } from '../utils/request';
import { endpointStrings } from '../providers/types';
import { logger } from '../apm';

/**
 * Handler for the Responses API endpoints (/v1/responses)
 *
 * This handler always passes through to tryTargetsRecursively with the
 * original endpoint. The per-provider adapter decision (native vs chatComplete
 * translation) is made inside tryPost where the exact provider is known,
 * rather than pre-deciding at the handler level via recursive config walking.
 */
function modelResponsesHandler(
  endpoint: endpointStrings,
  method: 'POST' | 'GET' | 'DELETE'
) {
  async function handler(c: Context): Promise<Response> {
    try {
      const request = c.get('requestBodyData');
      const requestHeaders = c.get('mappedHeaders');
      const camelCaseConfig = constructConfigFromRequestHeaders(requestHeaders);

      return tryTargetsRecursively(
        c,
        camelCaseConfig ?? {},
        method === 'POST' ? request.bodyJSON : {},
        requestHeaders,
        endpoint,
        method,
        'config'
      );
    } catch (err: any) {
      logger.error(`${endpoint} error:`, err);
      return new Response(
        JSON.stringify({
          error: { message: 'Internal error', type: 'server_error' },
        }),
        { status: 500, headers: { 'content-type': 'application/json' } }
      );
    }
  }
  return handler;
}

export default modelResponsesHandler;
