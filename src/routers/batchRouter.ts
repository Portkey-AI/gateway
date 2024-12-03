import { Context, Hono } from 'hono';
import {
  constructConfigFromRequestHeaders,
  tryTargetsRecursively,
} from '../handlers/handlerUtils';
import { endpointStrings } from '../providers/types';

function getHandler(endpoint: endpointStrings, method: string) {
  async function handler(c: Context): Promise<Response> {
    try {
      let requestHeaders = Object.fromEntries(c.req.raw.headers);
      let request = endpoint === 'createBatch' ? await c.req.json() : {};
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
      console.log(`${endpoint} error`, err.message);
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

const batchRouter = new Hono();

batchRouter.post('/', getHandler('createBatch', 'POST'));
batchRouter.get('/:id', getHandler('retrieveBatch', 'GET'));
batchRouter.post('/:id/cancel', getHandler('cancelBatch', 'POST'));
batchRouter.get('/', getHandler('listBatches', 'GET'));

export default batchRouter;
