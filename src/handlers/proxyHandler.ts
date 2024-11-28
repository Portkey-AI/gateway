import { Context } from 'hono';
import { CONTENT_TYPES, POWERED_BY } from '../globals';
import {
  constructConfigFromRequestHeaders,
  tryTargetsRecursively,
} from './handlerUtils';
import { RouterError } from '../errors/RouterError';
import { env } from 'hono/adapter';

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

function headersToSend(
  headersObj: Record<string, string>,
  customHeadersToIgnore: Array<string>
): Record<string, string> {
  let final: Record<string, string> = {};
  const poweredByHeadersPattern = `x-${POWERED_BY}-`;
  const headersToAvoidForCloudflare = ['expect'];
  const headersToAvoid = [
    ...customHeadersToIgnore,
    ...headersToAvoidForCloudflare,
  ];
  headersToAvoid.push('content-length');
  Object.keys(headersObj).forEach((key: string) => {
    if (
      !headersToAvoid.includes(key) &&
      !key.startsWith(poweredByHeadersPattern)
    ) {
      final[key] = headersObj[key];
    }
  });

  // Remove brotli from accept-encoding because cloudflare has problems with it
  if (final['accept-encoding']?.includes('br'))
    final['accept-encoding'] = final['accept-encoding']?.replace('br', '');

  return final;
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
      headersToSend(requestHeaders, env(c).CUSTOM_HEADERS_TO_IGNORE ?? []),
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
