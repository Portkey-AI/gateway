import { Context } from 'hono';
import { tryTargetsRecursively } from './handlerUtils';
import { logger } from '../apm';
import { CONTENT_TYPES } from '../globals';
import { constructConfigFromRequestHeaders } from '../utils/request';

async function getRequestData(
  requestBodyData: Record<string, any>,
  contentType: string,
  method: string
) {
  let finalRequest: any;
  if (contentType == CONTENT_TYPES.APPLICATION_JSON) {
    if (['GET', 'DELETE'].includes(method)) {
      finalRequest = {};
    } else {
      finalRequest = requestBodyData.bodyJSON;
    }
  } else if (contentType == CONTENT_TYPES.MULTIPART_FORM_DATA) {
    finalRequest = requestBodyData.bodyFormData;
  } else if (
    contentType?.startsWith(CONTENT_TYPES.GENERIC_AUDIO_PATTERN) ||
    contentType?.startsWith(CONTENT_TYPES.APPLICATION_OCTET_STREAM)
  ) {
    finalRequest = requestBodyData.requestBinary;
  }

  return finalRequest;
}

export async function proxyHandler(c: Context): Promise<Response> {
  try {
    const requestHeaders = c.get('mappedHeaders');
    const requestContentType = requestHeaders['content-type']?.split(';')[0];
    const request = await getRequestData(
      c.get('requestBodyData'),
      requestContentType,
      c.req.method
    );

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
    logger.error(`proxy error:`, err);
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
