import { Context } from 'hono';
import { logger } from '../apm';
import { tryTargetsRecursively } from './handlerUtils';
import { constructConfigFromRequestHeaders } from '../utils/request';

/**
 * Handler for the Messages API endpoints (/v1/messages)
 *
 * This handler always passes through to tryTargetsRecursively with fn='messages'.
 * The per-provider adapter decision (native vs chatComplete translation) is made
 * inside tryPost where the exact provider is known, rather than pre-deciding
 * at the handler level via recursive config walking.
 */
export async function messagesHandler(c: Context): Promise<Response> {
  try {
    const request = c.get('requestBodyData');
    const requestHeaders = c.get('mappedHeaders');
    const camelCaseConfig = constructConfigFromRequestHeaders(requestHeaders);

    return tryTargetsRecursively(
      c,
      camelCaseConfig ?? {},
      request.bodyJSON,
      requestHeaders,
      'messages',
      'POST',
      'config'
    );
  } catch (err: any) {
    logger.error('messages error:', err);
    return new Response(
      JSON.stringify({
        error: { message: 'Internal error', type: 'server_error' },
      }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}
