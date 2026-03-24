import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getCurrentContentPart, HttpError, TimeoutError } from '../utils';
import {
  hostName,
  postAktoValidateRequest,
  runAktoGatewayHeartbeatOnStartup,
  runAktoHostCollectionRegistrationOnStartup,
  type AktoScanRequest,
} from '../../src/utils/aktoApi';

// Constants
const API_ENDPOINT = '/api/validate/request';
const DEFAULT_TIMEOUT = 5000;
let aktoStartupInitOncePromise: Promise<void> | null = null;

function ensureAktoStartupInitOnce(jwtToken: string): Promise<void> {
  if (!aktoStartupInitOncePromise) {
    aktoStartupInitOncePromise = Promise.all([
      runAktoGatewayHeartbeatOnStartup(jwtToken),
      runAktoHostCollectionRegistrationOnStartup(jwtToken),
    ]).then(() => undefined);
  }
  return aktoStartupInitOncePromise;
}

interface AktoCredentials {
  apiDomain: string;
  apiKey: string;
  baseUrl?: string; // Optional baseUrl to override apiDomain + API_ENDPOINT construction
}

function headerValue(
  headers: Record<string, string> | undefined,
  name: string
): string {
  if (!headers) return '';
  const lower = name.toLowerCase();
  const key = Object.keys(headers).find((k) => k.toLowerCase() === lower);
  return key ? String(headers[key]) : '';
}

function clientIpFromHeaders(
  headers: Record<string, string> | undefined
): string {
  const xff = headerValue(headers, 'x-forwarded-for');
  if (xff) return normalizeClientIp(xff.split(',')[0].trim());
  const realIp = headerValue(headers, 'x-real-ip');
  if (realIp) return normalizeClientIp(realIp);
  const cf = headerValue(headers, 'cf-connecting-ip');
  if (cf) return normalizeClientIp(cf);
  return '';
}

function normalizeClientIp(ip: string): string {
  const t = ip.trim();
  if (t === '::1') return '127.0.0.1';
  return t.replace(/^::ffff:/, '');
}

function resolveAktoPath(context: PluginContext): string {
  const httpPath = context.request?.path;
  if (typeof httpPath === 'string' && httpPath.length > 0) return httpPath;
  const bodyPath = context.request?.json?.path;
  if (typeof bodyPath === 'string' && bodyPath.length > 0) return bodyPath;
  return '/v1/chat/completions';
}

// Helper to create consistent error response
const createErrorResponse = (
  error: string | Error,
  verdict: boolean = true
) => ({
  error: typeof error === 'string' ? error : error.message,
  verdict,
  data: null,
  transformedData: {
    request: { json: null },
    response: { json: null },
  },
  transformed: false,
});

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType,
  options?: { env?: Record<string, unknown> }
) => {
  let error = null;
  let verdict = true; // Default to allow (fail open)
  let data = null;
  const transformedData: Record<string, unknown> = {
    request: {
      json: null,
    },
    response: {
      json: null,
    },
  };
  let transformed = false;

  const credentials = parameters.credentials as unknown as
    | AktoCredentials
    | undefined;

  const fromBinding =
    typeof options?.env?.PORTKEY_AKTO_API_KEY === 'string'
      ? options.env.PORTKEY_AKTO_API_KEY.trim()
      : '';
  const fromProcess =
    typeof process !== 'undefined' &&
    typeof process.env.PORTKEY_AKTO_API_KEY === 'string'
      ? process.env.PORTKEY_AKTO_API_KEY.trim()
      : '';
  const apiKey =
    (typeof credentials?.apiKey === 'string' && credentials.apiKey.trim()
      ? credentials.apiKey.trim()
      : '') ||
    fromBinding ||
    fromProcess;

  // Validate credentials
  // We require either apiDomain or baseUrl, and apiKey (config or PORTKEY_AKTO_API_KEY)
  if (!apiKey) {
    return createErrorResponse('Missing required credentials: apiKey');
  }

  // Determine API URL
  let apiUrl: string;
  if (credentials?.baseUrl) {
    apiUrl = credentials.baseUrl;
  } else if (credentials?.apiDomain) {
    // If apiDomain is provided, construct the URL
    // Handle cases where apiDomain might include protocol or trailing slash
    let domain = credentials.apiDomain
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '');
    apiUrl = `https://${domain}${API_ENDPOINT}`;
  } else {
    return createErrorResponse(
      'Missing required credentials: apiDomain or baseUrl'
    );
  }

  // Extract content
  // We use getCurrentContentPart helper to handle both request and response hooks
  const { content } = getCurrentContentPart(context, eventType);

  if (!content) {
    return createErrorResponse('Request or response content is empty');
  }

  // Extract parameters with defaults
  const timeout = (parameters.timeout as number) || DEFAULT_TIMEOUT;

  try {
    const requestPayload = JSON.stringify({
      body: typeof content === 'string' ? content : JSON.stringify(content),
    });
    const requestPath = resolveAktoPath(context);
    const headers = context.request?.headers as
      | Record<string, string>
      | undefined;
    const requestHeaders = JSON.stringify({ host: hostName });
    const ip = clientIpFromHeaders(headers);
    const tagAndMeta = JSON.stringify({
      'gen-ai': 'Gen AI',
    });
    const statusNum =
      eventType === 'afterRequestHook' && context.response?.statusCode != null
        ? context.response.statusCode
        : 200;
    const statusStr = String(statusNum);

    const requestBody: AktoScanRequest = {
      requestHeaders,
      path: requestPath,
      method: 'POST',
      requestPayload,
      ip,
      time: String(Date.now()),
      statusCode: statusStr,
      status: statusStr,
      tag: tagAndMeta,
      metadata: tagAndMeta,
      contextSource: 'ENDPOINT',
      source: 'MIRRORING',
    };
    await ensureAktoStartupInitOnce(apiKey);
    const response = await postAktoValidateRequest(
      apiUrl,
      requestBody,
      apiKey,
      timeout
    );

    data = response;

    // Check if request is blocked by Akto
    // Explicit check for Allowed === false to be safe
    if (response && response.Allowed === false) {
      verdict = false;
    } else {
      verdict = true;
    }
  } catch (e) {
    // Determine error type and handle accordingly
    if (e instanceof HttpError) {
      const status = e.response.status;
      if (status === 401 || status === 403) {
        error = `Authentication failed (${status}): Please check your API key`;
      } else if (status === 429) {
        error = 'Rate limit exceeded: Please try again later';
      } else if (status >= 500) {
        error = `Service unavailable (${status}): Akto service might be down`;
      } else {
        error = `HTTP ${status} error: ${e.response.statusText}`;
      }
    } else if (e instanceof TimeoutError) {
      error = `Request timeout after ${timeout}ms: Akto scan took too long`;
    } else {
      error =
        e instanceof Error
          ? e.message
          : 'Unknown error occurred during Akto scan';
    }

    // Fail open on errors to prevent blocking legitimate requests due to plugin failure
    // This is a critical design decision for production reliability
    verdict = true;
    data = null;
  }

  return {
    error,
    verdict,
    data,
    transformedData,
    transformed,
  };
};
