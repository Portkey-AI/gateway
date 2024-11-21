import { Context } from 'hono';
import { env } from 'hono/adapter';
import {
  ANTHROPIC,
  AZURE_OPEN_AI,
  CONTENT_TYPES,
  HEADER_KEYS,
  MAX_RETRIES,
  OLLAMA,
  POWERED_BY,
  RETRY_STATUS_CODES,
  TRITON,
} from '../globals';
import Providers from '../providers';
import { Config, ShortConfig } from '../types/requestBody';
import { convertKeysToCamelCase, getStreamingMode } from '../utils';
import {
  constructConfigFromRequestHeaders,
  fetchProviderOptionsFromConfig,
  tryProvidersInSequence,
  tryTargetsRecursively,
  updateResponseHeaders,
} from './handlerUtils';
import { retryRequest } from './retryHandler';
import { responseHandler } from './responseHandlers';
import { RouterError } from '../errors/RouterError';
// Find the proxy provider
function proxyProvider(proxyModeHeader: string, providerHeader: string) {
  const proxyProvider = proxyModeHeader?.split(' ')[1] ?? providerHeader;
  return proxyProvider;
}

function getProxyPath(
  requestURL: string,
  proxyProvider: string,
  proxyEndpointPath: string,
  customHost: string
) {
  let reqURL = new URL(requestURL);
  let reqPath = reqURL.pathname;
  const reqQuery = reqURL.search;
  reqPath = reqPath.replace(proxyEndpointPath, '');

  if (customHost) {
    return `${customHost}${reqPath}${reqQuery}`;
  }

  const providerBasePath = Providers[proxyProvider].api.getBaseURL({
    providerOptions: {},
  });
  if (proxyProvider === AZURE_OPEN_AI) {
    return `https:/${reqPath}${reqQuery}`;
  }

  if (proxyProvider === OLLAMA || proxyProvider === TRITON) {
    return `https:/${reqPath}`;
  }
  let proxyPath = `${providerBasePath}${reqPath}${reqQuery}`;

  // Fix specific for Anthropic SDK calls. Is this needed? - Yes
  if (proxyProvider === ANTHROPIC) {
    proxyPath = proxyPath.replace('/v1/v1/', '/v1/');
  }

  return proxyPath;
}

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
  } else if (contentType.startsWith(CONTENT_TYPES.GENERIC_AUDIO_PATTERN)) {
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
    const requestContentType = requestHeaders['content-type'].split(';')[0];

    const request = await getRequestData(c.req.raw, requestContentType);

    const camelCaseConfig = constructConfigFromRequestHeaders(requestHeaders);

    const tryTargetsResponse = await tryTargetsRecursively(
      c,
      camelCaseConfig,
      request,
      headersToSend(requestHeaders, []),
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
