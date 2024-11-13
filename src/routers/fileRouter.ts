import { Context, Hono } from 'hono';
import {
  constructConfigFromRequestHeaders,
  tryTargetsRecursively,
} from '../handlers/handlerUtils';
import { endpointStrings } from '../providers/types';
import { requestValidator } from '../middlewares/requestValidator';

const fileRouter = new Hono();

function getHandler(endpoint: endpointStrings, method: string) {
  async function handler(c: Context): Promise<Response> {
    try {
      let requestHeaders = Object.fromEntries(c.req.raw.headers);
      const camelCaseConfig = constructConfigFromRequestHeaders(requestHeaders);
      const tryTargetsResponse = await tryTargetsRecursively(
        c,
        camelCaseConfig ?? {},
        {},
        requestHeaders,
        endpoint,
        'GET',
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

fileRouter.get('/', requestValidator, getHandler('getFiles', 'GET'));
fileRouter.get('/:id', requestValidator, getHandler('getFile', 'GET'));
fileRouter.get(
  '/:id/content',
  requestValidator,
  getHandler('getFileContent', 'GET')
);

fileRouter.post('/', requestValidator, getHandler('uploadFile', 'POST'));

fileRouter.delete('/:id', requestValidator, getHandler('deleteFile', 'DELETE'));

export default fileRouter;
