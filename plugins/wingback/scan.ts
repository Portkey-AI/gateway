import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { HttpError, post, TimeoutError } from '../utils';

export const WINGBACK_DEFAULT_BASE_URL = 'https://api.wingback.ai';
export const WINGBACK_GUARDRAIL_WEBHOOK_PATH =
  '/connectors/integrations/portkey/guardrail-webhook';
export const WINGBACK_DEFAULT_SCAN_TIMEOUT_MS = 2500;

export interface WingbackWebhookResponse {
  verdict: boolean;
  transformedData?: {
    request?: { json?: Record<string, unknown> | null; text?: string | null };
    response?: { json?: Record<string, unknown> | null; text?: string | null };
  };
  data?: Record<string, unknown> | null;
  error?: { message?: string } | null;
}

export function resolveWingbackWebhookUrl(
  credentials: PluginParameters['credentials']
): string {
  const base =
    (credentials?.baseUrl as string | undefined)?.trim() ||
    WINGBACK_DEFAULT_BASE_URL;
  const trimmed = base.replace(/\/$/, '');
  return `${trimmed}${WINGBACK_GUARDRAIL_WEBHOOK_PATH}`;
}

export function buildWingbackWebhookBody(
  context: PluginContext,
  eventType: HookEventType,
  extraMetadata?: Record<string, unknown>
): Record<string, unknown> {
  const contextMetadata =
    context.metadata && typeof context.metadata === 'object'
      ? (context.metadata as Record<string, unknown>)
      : {};
  const metadata =
    extraMetadata && typeof extraMetadata === 'object'
      ? { ...contextMetadata, ...extraMetadata }
      : contextMetadata;

  return {
    ...context,
    metadata,
    request: { ...context.request, headers: undefined },
    eventType,
  };
}

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error: unknown = null;
  let verdict = true;
  let data: Record<string, unknown> | null = null;
  const transformedData: Record<string, any> = {
    request: {
      json: null,
      text: null,
    },
    response: {
      json: null,
      text: null,
    },
  };
  let transformed = false;

  const timeout =
    typeof parameters.timeout === 'number'
      ? parameters.timeout
      : WINGBACK_DEFAULT_SCAN_TIMEOUT_MS;

  try {
    const apiKey = parameters.credentials?.apiKey;
    if (!apiKey || typeof apiKey !== 'string') {
      throw new Error('Wingback integration API key is required');
    }

    const url = resolveWingbackWebhookUrl(parameters.credentials);
    const extraMetadata =
      parameters.metadata && typeof parameters.metadata === 'object'
        ? (parameters.metadata as Record<string, unknown>)
        : undefined;

    const requestBody = buildWingbackWebhookBody(
      context,
      eventType,
      extraMetadata
    );

    const response = await post<WingbackWebhookResponse>(
      url,
      requestBody,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
      timeout
    );

    verdict = response.verdict !== false;

    if (
      response.transformedData?.request?.json &&
      eventType === 'beforeRequestHook'
    ) {
      transformedData.request.json = response.transformedData.request.json;
      transformed = true;
    }

    if (
      response.transformedData?.response?.json &&
      eventType === 'afterRequestHook'
    ) {
      transformedData.response.json = response.transformedData.response.json;
      transformed = true;
    }

    data = {
      wingback: response.data ?? null,
      verdict,
    };
  } catch (e: any) {
    error = e;
    if (error && typeof error === 'object' && 'stack' in error) {
      delete error.stack;
    }

    // Wingback fails open when the scan path is unavailable (match connectors-service).
    verdict = true;

    const isTimeoutError = e instanceof TimeoutError;
    const httpError = e instanceof HttpError ? e : null;
    const responseBody = httpError?.response?.body;
    const contentType = httpError?.response?.headers?.get('content-type');

    data = {
      explanation: `Wingback scan error: ${e?.message ?? 'unknown error'}`,
      failOpen: true,
      requestContext: { timeout },
      ...(responseBody &&
        contentType === 'application/json' && {
          wingback: JSON.parse(responseBody),
        }),
      ...(isTimeoutError && { timedOut: true }),
    };
  }

  return { error, verdict, data, transformedData, transformed };
};
