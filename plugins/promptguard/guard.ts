import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { HttpError, post } from '../utils';
import { getContentParts, setContentParts } from './content';

export const VERSION = 'v1.0.0';

export interface PromptGuardCredentials {
  /** PromptGuard API key, sent in the `X-API-Key` header. */
  apiKey: string;
  /** Base URL of the PromptGuard deployment; `/api/v1/guard` is appended. */
  apiBase: string;
  /** Fail closed (default `true`) or open (`false`) when PromptGuard errors. */
  blockOnError?: boolean;
}

interface GuardMessage {
  role: string;
  content: string;
}

interface GuardResponse {
  decision: 'allow' | 'block' | 'redact';
  event_id: string;
  confidence: number;
  weighted_score?: number | null;
  threat_type?: string | null;
  redacted_messages?: GuardMessage[] | null;
  threats?: Array<{ type: string; confidence: number; details: string }>;
  latency_ms: number;
}

/** Request types whose content `setContentParts` can rewrite. */
const WRITABLE_REQUEST_TYPES = new Set([
  'chatComplete',
  'messages',
  'complete',
  'embed',
]);

/**
 * Calls `POST {apiBase}/api/v1/guard` and maps the decision onto the
 * guardrail result:
 *
 *   allow  -> verdict true
 *   block  -> verdict false
 *   redact -> verdict true, transformed, transformedData carries the
 *             redacted request/response
 *
 * Errors reaching PromptGuard, and redactions that cannot be applied, honour
 * `blockOnError` (default true: verdict false). A missing apiKey or apiBase
 * returns verdict true with an error, without calling PromptGuard.
 */
export const handler: PluginHandler<PromptGuardCredentials> = async (
  context: PluginContext,
  parameters: PluginParameters<PromptGuardCredentials>,
  eventType: HookEventType
) => {
  let error: any = null;
  let verdict = true;
  let data: any = null;
  let transformed = false;
  const transformedData: Record<string, any> = {
    request: { json: null },
    response: { json: null },
  };

  const credentials = parameters.credentials;
  if (!credentials?.apiKey) {
    return {
      error: `'parameters.credentials.apiKey' must be set`,
      verdict: true,
      data,
    };
  }
  if (!credentials?.apiBase) {
    return {
      error: `'parameters.credentials.apiBase' must be set`,
      verdict: true,
      data,
    };
  }

  const blockOnError =
    parameters.blockOnError ?? credentials.blockOnError ?? true;

  const textArray = getContentParts(context, eventType);

  // Only non-empty text parts are sent; image and audio parts carry no text
  // and pass through untouched.
  const scannable = textArray
    .map((text, index) => ({ text, index }))
    .filter((part) => typeof part.text === 'string' && part.text.trim() !== '');

  if (scannable.length === 0) {
    return { error, verdict: true, data, transformedData, transformed };
  }

  const isRequest = eventType === 'beforeRequestHook';
  const role = isRequest ? 'user' : 'assistant';

  // `model` is a model name from the payload, not the gateway provider slug.
  const model =
    context.request?.json?.model ??
    context.response?.json?.model ??
    parameters.model ??
    undefined;

  const requestBody = {
    messages: scannable.map((part) => ({ role, content: part.text })),
    direction: isRequest ? 'input' : 'output',
    model,
  };

  const url = `${credentials.apiBase.replace(/\/+$/, '')}/api/v1/guard`;
  const requestOptions = {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': `promptguard-portkey-plugin/${VERSION}`,
      'X-API-Key': credentials.apiKey,
    },
  };

  let response: GuardResponse;
  try {
    response = await post<GuardResponse>(
      url,
      requestBody,
      requestOptions,
      parameters.timeout
    );
  } catch (e) {
    error =
      e instanceof HttpError ? `${e.message}. body: ${e.response.body}` : e;
    return {
      error,
      verdict: !blockOnError,
      data,
      transformedData,
      transformed,
    };
  }

  data = response;

  if (response.decision === 'block') {
    verdict = false;
  } else if (response.decision === 'redact') {
    if (!WRITABLE_REQUEST_TYPES.has(context.requestType ?? '')) {
      return {
        error: `PromptGuard returned redact for an unwritable requestType: ${context.requestType}`,
        verdict: !blockOnError,
        data,
        transformedData,
        transformed: false,
      };
    }

    // `null` leaves a position untouched (image parts, empty choices).
    const redacted = response.redacted_messages || [];
    const redactedArray: Array<string | null> = textArray.map(() => null);
    let applied = 0;
    scannable.forEach((part, i) => {
      const replacement = redacted[i]?.content;
      if (typeof replacement === 'string') {
        redactedArray[part.index] = replacement;
        applied += 1;
      }
    });

    // A redact decision without a replacement for every scanned part would
    // forward content PromptGuard asked to remove, so it is an error.
    if (applied !== scannable.length) {
      return {
        error:
          `PromptGuard returned redact with ${applied} usable replacement(s) ` +
          `for ${scannable.length} scanned part(s); refusing to report a ` +
          `redaction that was not applied`,
        verdict: !blockOnError,
        data,
        transformedData,
        transformed: false,
      };
    }

    setContentParts(context, eventType, transformedData, redactedArray);
    transformed = true;
  }

  return { error, verdict, data, transformedData, transformed };
};
