import { Context, Hono } from 'hono';
import {
  constructConfigFromRequestHeaders,
  tryTargetsRecursively,
} from '../handlers/handlerUtils';
import { endpointStrings } from '../providers/types';
import { requestValidator } from '../middlewares/requestValidator';

const fileRouter = new Hono();

function handler(endpoint: endpointStrings, method: 'POST' | 'GET' | 'DELETE') {
  async function handler(c: Context): Promise<Response> {
    try {
      let requestHeaders = Object.fromEntries(c.req.raw.headers);
      const camelCaseConfig = constructConfigFromRequestHeaders(requestHeaders);
      const body = endpoint === 'uploadFile' ? await c.req.raw.formData() : {};
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

fileRouter.get('/', requestValidator, handler('getFiles', 'GET'));
fileRouter.get('/:id', requestValidator, handler('getFile', 'GET'));
fileRouter.get(
  '/:id/content',
  requestValidator,
  handler('getFileContent', 'GET')
);

fileRouter.post('/', requestValidator, handler('uploadFile', 'POST'));

fileRouter.delete('/:id', requestValidator, handler('deleteFile', 'DELETE'));

export default fileRouter;
