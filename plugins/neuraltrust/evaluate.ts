import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginHandlerResponse,
  PluginParameters,
} from '../types';
import { HttpError, TimeoutError } from '../utils';
import {
  AUTH_HTTP_STATUSES,
  DEFAULT_API_BASE,
  DEFAULT_TIMEOUT,
  EVALUATE_PATH,
  KNOWN_STATUSES,
  STATUS_BLOCK,
  STATUS_TRANSFORM,
  TrustGuardStatus,
  UNREACHABLE_HTTP_STATUSES,
  postTrustGuard,
} from './globals';
import {
  EvaluatePayload,
  JsonRecord,
  TransformedData,
  applyTransform,
  buildPayload,
  emptyTransformedData,
  isRecord,
} from './payload';

type TrustGuardCredentials = {
  apiKey?: string;
  collectorKey?: string;
  apiBase?: string;
};

type TrustGuardResponse = {
  status: TrustGuardStatus;
  trace_id?: unknown;
  request_id?: unknown;
  findings?: unknown;
  transformed_payload?: unknown;
};

type UnreachableFallback = 'fail_closed' | 'fail_open';

const TRANSFORM_MISSING = 'TrustGuard transform missing payload';
const UNKNOWN_VERDICT = 'TrustGuard returned an unknown verdict';
const UNREACHABLE = 'TrustGuard guardrail service unreachable';
const AUTH_FAILED = 'TrustGuard authentication failed';
const ENTITLEMENTS = 'TrustGuard entitlements unavailable';
const REQUEST_FAILED = 'TrustGuard request failed';
const MISSING_API_KEY = 'TrustGuard API key is required';

const STATUS_EXPLANATION: Record<TrustGuardStatus, string> = {
  allow: 'Allowed by TrustGuard',
  block: 'Blocked by TrustGuard',
  report: 'Reported by TrustGuard',
  transform: 'Transformed by TrustGuard',
};

function result(partial: {
  error: PluginHandlerResponse['error'];
  verdict: boolean;
  data: PluginHandlerResponse['data'];
  transformedData: TransformedData;
  transformed?: boolean;
}): PluginHandlerResponse {
  return {
    error: partial.error,
    verdict: partial.verdict,
    data: partial.data,
    transformedData: partial.transformedData,
    transformed: partial.transformed ?? false,
  };
}

function failClosed(
  message: string,
  transformedData: TransformedData,
  extra: JsonRecord = {}
): PluginHandlerResponse {
  return result({
    error: null,
    verdict: false,
    data: { explanation: message, ...extra },
    transformedData,
  });
}

function unreachableResult(
  message: string,
  fallback: UnreachableFallback,
  transformedData: TransformedData
): PluginHandlerResponse {
  if (fallback === 'fail_open') {
    return result({
      error: { name: 'TrustGuardError', message },
      verdict: false,
      data: { explanation: message },
      transformedData,
    });
  }
  return failClosed(message, transformedData);
}

function modelName(context: PluginContext): string {
  const model = context.request?.json?.model;
  return typeof model === 'string' ? model : '';
}

function sessionId(context: PluginContext): string | undefined {
  const metadata = context.metadata;
  if (!metadata) {
    return undefined;
  }
  const value = metadata.session_id ?? metadata._session_id;
  return typeof value === 'string' && value ? value : undefined;
}

function resolveTimeout(parameters: PluginParameters): number {
  const timeout = parameters.timeout;
  return typeof timeout === 'number' && timeout > 0 ? timeout : DEFAULT_TIMEOUT;
}

function resolveApiBase(credentials: TrustGuardCredentials): string | null {
  const base = credentials.apiBase;
  if (base === undefined || base === null || base === '') {
    return DEFAULT_API_BASE;
  }
  if (typeof base !== 'string') {
    return null;
  }
  return base.replace(/\/+$/, '');
}

function resolveFallback(parameters: PluginParameters): UnreachableFallback {
  return parameters.unreachableFallback === 'fail_open'
    ? 'fail_open'
    : 'fail_closed';
}

function isStreamingAfterRequest(
  context: PluginContext,
  eventType: HookEventType
): boolean {
  return eventType === 'afterRequestHook' && !context.response?.json;
}

function evaluateBody(
  payload: EvaluatePayload,
  context: PluginContext,
  eventType: HookEventType,
  collectorKey: string | undefined
): JsonRecord {
  const body: JsonRecord = {
    payload,
    direction: eventType === 'beforeRequestHook' ? 'input' : 'output',
    protocol: 'llm',
    attributes: {
      content_type: 'application/json',
      model: { name: modelName(context) },
    },
  };
  if (collectorKey) {
    body.collector_key = collectorKey;
  }
  const sid = sessionId(context);
  if (sid) {
    body.session_id = sid;
  }
  return body;
}

function handleHttpError(
  error: HttpError,
  fallback: UnreachableFallback,
  transformedData: TransformedData
): PluginHandlerResponse {
  const status = error.response.status;
  if (AUTH_HTTP_STATUSES.has(status)) {
    return failClosed(AUTH_FAILED, transformedData);
  }
  if (status === 503) {
    return failClosed(ENTITLEMENTS, transformedData);
  }
  if (UNREACHABLE_HTTP_STATUSES.has(status)) {
    return unreachableResult(UNREACHABLE, fallback, transformedData);
  }
  return failClosed(REQUEST_FAILED, transformedData);
}

function parseEvaluateResponse(raw: unknown): TrustGuardResponse | null {
  if (!isRecord(raw) || typeof raw.status !== 'string') {
    return null;
  }
  const status = raw.status.toLowerCase();
  if (!KNOWN_STATUSES.has(status)) {
    return null;
  }
  return { ...raw, status: status as TrustGuardStatus };
}

function verdictData(parsed: TrustGuardResponse): JsonRecord {
  const data: JsonRecord = {
    explanation: STATUS_EXPLANATION[parsed.status],
    status: parsed.status,
    trace_id: parsed.trace_id ?? null,
    request_id: parsed.request_id ?? null,
  };
  if (parsed.findings !== undefined) {
    data.findings = parsed.findings;
  }
  return data;
}

function isJsonParseError(error: unknown): boolean {
  return (
    error instanceof SyntaxError ||
    (error instanceof Error && error.name === 'SyntaxError')
  );
}

async function runEvaluate(
  context: PluginContext,
  parameters: PluginParameters<TrustGuardCredentials>,
  eventType: HookEventType,
  transformedData: TransformedData
): Promise<PluginHandlerResponse> {
  const credentials = parameters.credentials || {};
  const fallback = resolveFallback(parameters);

  if (typeof credentials.apiKey !== 'string' || !credentials.apiKey) {
    return failClosed(MISSING_API_KEY, transformedData);
  }

  if (isStreamingAfterRequest(context, eventType)) {
    return result({
      error: null,
      verdict: true,
      data: null,
      transformedData,
    });
  }

  const payload = buildPayload(context, eventType);
  if (!payload) {
    return result({
      error: null,
      verdict: true,
      data: null,
      transformedData,
    });
  }

  const apiBase = resolveApiBase(credentials);
  if (!apiBase) {
    return failClosed(REQUEST_FAILED, transformedData);
  }

  const timeout = resolveTimeout(parameters);
  const url = `${apiBase}${EVALUATE_PATH}`;
  const collectorKey =
    typeof credentials.collectorKey === 'string'
      ? credentials.collectorKey
      : undefined;
  const body = evaluateBody(payload, context, eventType, collectorKey);

  let raw: unknown;
  try {
    raw = await postTrustGuard(url, body, credentials.apiKey, timeout);
  } catch (e: unknown) {
    if (e instanceof HttpError) {
      return handleHttpError(e, fallback, transformedData);
    }
    if (e instanceof TimeoutError) {
      return unreachableResult(
        `TrustGuard request timed out after ${e.timeout}ms`,
        fallback,
        transformedData
      );
    }
    if (isJsonParseError(e)) {
      return failClosed(UNKNOWN_VERDICT, transformedData);
    }
    return unreachableResult(UNREACHABLE, fallback, transformedData);
  }

  const parsed = parseEvaluateResponse(raw);
  if (!parsed) {
    return failClosed(UNKNOWN_VERDICT, transformedData);
  }

  const data = verdictData(parsed);

  if (parsed.status === STATUS_BLOCK) {
    return result({
      error: null,
      verdict: false,
      data,
      transformedData,
    });
  }

  if (parsed.status === STATUS_TRANSFORM) {
    const applied = applyTransform(
      context,
      eventType,
      transformedData,
      parsed.transformed_payload
    );
    if (!applied) {
      return failClosed(TRANSFORM_MISSING, transformedData);
    }
    return result({
      error: null,
      verdict: true,
      data,
      transformedData,
      transformed: true,
    });
  }

  return result({
    error: null,
    verdict: true,
    data,
    transformedData,
  });
}

export const handler: PluginHandler<TrustGuardCredentials> = async (
  context,
  parameters,
  eventType,
  _options
) => {
  const transformedData = emptyTransformedData();
  try {
    return await runEvaluate(context, parameters, eventType, transformedData);
  } catch {
    return failClosed(REQUEST_FAILED, transformedData);
  }
};
