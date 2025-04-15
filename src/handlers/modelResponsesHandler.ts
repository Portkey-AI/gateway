import { Context } from 'hono';
import {
  constructConfigFromRequestHeaders,
  patchConfigFromEnvironment,
  tryTargetsRecursively,
} from './handlerUtils';
import { endpointStrings } from '../providers/types';

function modelResponsesHandler(
  endpoint: endpointStrings,
  method: 'POST' | 'GET' | 'DELETE'
) {
  async function handler(c: Context): Promise<Response> {
    try {
      let requestHeaders = Object.fromEntries(c.req.raw.headers);
      let request = method === 'POST' ? await c.req.json() : {};
      let camelCaseConfig = constructConfigFromRequestHeaders(requestHeaders);

      // Patch config using env variables
      camelCaseConfig = patchConfigFromEnvironment(camelCaseConfig);

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
      console.error({ message: `${endpoint} error ${err.message}` });
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

export default modelResponsesHandler;
