import { Context } from 'hono';
import { CONTENT_TYPES } from '../globals';
import {
  constructConfigFromRequestHeaders,
  tryTargetsRecursively,
} from './handlerUtils';
import { RouterError } from '../errors/RouterError';

async function getRequestData(request: Request, contentType: string) {
  let finalRequest: any;
  if (contentType == CONTENT_TYPES.APPLICATION_JSON) {
    if (['GET', 'DELETE'].includes(request.method)) {
      finalRequest = {};
    } else {
      finalRequest = await request.json();
    }
  } else if (contentType == CONTENT_TYPES.MULTIPART_FORM_DATA) {
    finalRequest = await request.formData();
  } else if (contentType?.startsWith(CONTENT_TYPES.GENERIC_AUDIO_PATTERN)) {
    finalRequest = await request.arrayBuffer();
  }

  return finalRequest;
}

export async function proxyHandler(c: Context): Promise<Response> {
  try {
    let requestHeaders = Object.fromEntries(c.req.raw.headers);
    const requestContentType = requestHeaders['content-type']?.split(';')[0];

    const request = await getRequestData(c.req.raw, requestContentType);

    const camelCaseConfig = constructConfigFromRequestHeaders(requestHeaders);

    const tryTargetsResponse = await tryTargetsRecursively(
      c,
      camelCaseConfig,
      request,
      requestHeaders,
      'proxy',
      c.req.method,
      'config'
    );

    return tryTargetsResponse;
  } catch (err: any) {
    console.log('proxy error', err.message);
    let statusCode = 500;
    let errorMessage = `Proxy error: ${err.message}`;

    if (err instanceof RouterError) {
      statusCode = 400;
      errorMessage = err.message;
    }

    return new Response(
      JSON.stringify({
        status: 'failure',
        message: errorMessage,
      }),
      {
        status: statusCode,
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  }
}
