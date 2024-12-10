import { Context, Hono } from 'hono';
import {
  constructConfigFromRequestHeaders,
  tryTargetsRecursively,
} from '../handlers/handlerUtils';
import { endpointStrings } from '../providers/types';
import { requestValidator } from '../middlewares/requestValidator';

const filesRouter = new Hono();

function handler(endpoint: endpointStrings, method: 'POST' | 'GET' | 'DELETE') {
  async function handler(c: Context): Promise<Response> {
    try {
      let requestHeaders = Object.fromEntries(c.req.raw.headers);
      const camelCaseConfig = constructConfigFromRequestHeaders(requestHeaders);
      let body = {};
      if (c.req.raw.body instanceof ReadableStream) {
        body = c.req.raw.body;
      }
      const tryTargetsResponse = await tryTargetsRecursively(
        c,
        camelCaseConfig ?? {},
        body,
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

filesRouter.get('/', requestValidator, handler('listFiles', 'GET'));
filesRouter.get('/:id', requestValidator, handler('retrieveFile', 'GET'));
filesRouter.get(
  '/:id/content',
  requestValidator,
  handler('retrieveFileContent', 'GET')
);

filesRouter.post('/', requestValidator, handler('uploadFile', 'POST'));

filesRouter.delete('/:id', requestValidator, handler('deleteFile', 'DELETE'));

export default filesRouter;
