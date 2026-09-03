// +-------------------------------------------------------------+
//
//                    Use Alice for your LLM calls
//                         https://alice.io/
//
// +-------------------------------------------------------------+

import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginHandlerResponse,
  PluginParameters,
} from '../types';
import {
  getCurrentContentPart,
  post,
  setCurrentContentPart,
  HttpError,
} from '../utils';

const DEFAULT_API_BASE = 'https://api.alice.io';
const EVALUATE_PATH = '/v2/evaluate/portkey';
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_BLOCK_MESSAGE = "Blocked by your organization's content policy.";

const VERDICT_ALLOW = 'ALLOW';
const VERDICT_BLOCK = 'BLOCK';
const VERDICT_MASK = 'MASK';
const VERDICT_DETECT = 'DETECT';
const KNOWN_VERDICTS = [
  VERDICT_ALLOW,
  VERDICT_BLOCK,
  VERDICT_MASK,
  VERDICT_DETECT,
];

// Caps on the outbound copy of the hook context. A payload deeper or wider than this is malformed
// rather than large, and serializing it would cost more than the evaluation it feeds.
const MAX_DEPTH = 12;
const MAX_ITEMS = 5000;

/**
 * The hook context carries the caller's raw credentials, and not only at the root:
 * `context.request.headers` holds the inbound `Authorization` and `x-portkey-api-key` in the clear,
 * and a provider key can ride along under `credentials` or `api_key`. Stripping by key name at
 * every depth rather than by path means a new nesting path can never reintroduce the leak the way a
 * fixed path list could. None of these leave the gateway.
 */
const CREDENTIAL_KEYS_TO_STRIP = [
  'headers',
  'credentials',
  'api_key',
  'apiKey',
  'authorization',
  'cookie',
];

/** Portkey's trace id header. One trace spans a conversation, so Alice groups on it. */
const TRACE_ID_HEADER = 'x-portkey-trace-id';

interface AliceReplacement {
  index?: number;
  text?: string;
}

interface AliceVerdict {
  verdict?: string;
  categories?: string[];
  correlation_id?: string;
  message?: string;
  replacements?: AliceReplacement[];
}

/**
 * Alice — policy-based guardrails for prompts and model responses. https://alice.io/
 *
 * This forwards the hook context as it received it and enforces the verdict that comes back, with
 * one deliberate exception: any key named `headers`, `credentials`, `api_key`, `apiKey`,
 * `authorization` or `cookie` is dropped at any nesting depth before the body is serialized, and
 * never reaches Alice. Short of that it selects nothing and renames nothing — which parts of a turn
 * are worth evaluating, and how a verdict is reached, are decided on Alice's side, so changing
 * either is a deploy there rather than a gateway rebuild for every user of this plugin.
 *
 * Two things stay here, because a plugin alone can do them: reading the current content part out of
 * Portkey's request shape, and writing a mask back into it.
 *
 * A transport failure, a timeout, an unreadable body or an unrecognized verdict is reported as a
 * check error and never as a pass. Portkey's own `failOnError` on the check decides whether such a
 * request proceeds — set it to `true` to fail closed.
 */
export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
): Promise<PluginHandlerResponse> => {
  const apiKey = parameters.credentials?.apiKey;
  if (!apiKey) {
    return {
      error: `'parameters.credentials.apiKey' must be set`,
      verdict: true,
      data: null,
    };
  }

  // Alice measures a request against the policies of one application, so a request naming none is
  // refused rather than evaluated against a guess.
  const appId =
    typeof parameters.appId === 'string' ? parameters.appId.trim() : '';
  if (!appId) {
    return {
      error: `'parameters.appId' must be set to the application whose policies apply`,
      verdict: true,
      data: null,
    };
  }

  if (eventType !== 'beforeRequestHook' && eventType !== 'afterRequestHook') {
    return {
      error: `Unsupported hook type: ${eventType}`,
      verdict: true,
      data: null,
    };
  }

  let content;
  try {
    content = getCurrentContentPart(context, eventType);
  } catch (e) {
    // A shape Portkey could not read is not a pass — report it and let `failOnError` decide.
    return { error: e as Error, verdict: true, data: null };
  }

  const textArray = content.textArray;
  // Nothing to send. A streamed response reaches the after-request hook with no JSON at all, which
  // lands here rather than costing a round trip that could only answer ALLOW.
  if (!textArray.some((text) => text && text.trim().length > 0)) {
    return { error: null, verdict: true, data: null };
  }

  const base = (parameters.credentials?.apiBase || DEFAULT_API_BASE).replace(
    /\/+$/,
    ''
  );
  const inputType = eventType === 'beforeRequestHook' ? 'request' : 'response';

  let response: AliceVerdict;
  try {
    response = await post<AliceVerdict>(
      `${base}${EVALUATE_PATH}`,
      {
        input_type: inputType,
        event_type: eventType,
        app_id: appId,
        trace_id: readTraceId(context),
        inputs: { texts: textArray },
        context: jsonSafe(context, 0, [], CREDENTIAL_KEYS_TO_STRIP),
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'af-api-key': apiKey,
        },
      },
      parameters.timeout || DEFAULT_TIMEOUT_MS
    );
  } catch (e) {
    // A 4xx is our own misconfiguration — a rejected credential, an application that does not
    // resolve — and a 5xx is an outage. Both are reported as check errors rather than as a pass,
    // so `failOnError` alone decides open versus closed.
    const error =
      e instanceof HttpError
        ? `${e.message}. body: ${e.response.body}`
        : (e as Error);
    return { error, verdict: true, data: null };
  }

  return enforce(response, context, eventType, textArray);
};

/** Act on the verdict. An answer we cannot read is reported as an error, never as a pass. */
function enforce(
  response: AliceVerdict,
  context: PluginContext,
  eventType: HookEventType,
  textArray: Array<string>
): PluginHandlerResponse {
  const verdictName = response?.verdict;
  if (!verdictName || !KNOWN_VERDICTS.includes(verdictName)) {
    return {
      error: `Unrecognized verdict from Alice: ${JSON.stringify(verdictName)}`,
      verdict: true,
      data: null,
    };
  }

  // The policy's own message usually ends in a full stop of its own, so it is trimmed before the
  // segments are joined — otherwise every block reads "…policy.. categories: …" in the logs.
  const explanation = (outcome: string) =>
    [
      outcome.replace(/\s*\.\s*$/, ''),
      response.categories?.length
        ? `categories: ${response.categories.join(', ')}`
        : null,
      response.correlation_id
        ? `correlation id: ${response.correlation_id}`
        : null,
    ]
      .filter(Boolean)
      .join('. ');

  if (verdictName === VERDICT_BLOCK) {
    return {
      error: null,
      verdict: false,
      data: {
        explanation: explanation(response.message || DEFAULT_BLOCK_MESSAGE),
      },
    };
  }

  if (verdictName === VERDICT_DETECT) {
    // Recorded on Alice's side and allowed through. The correlation id is what ties this request to
    // that record; the evaluated text itself is never carried here.
    return {
      error: null,
      verdict: true,
      data: { explanation: explanation('Detection recorded, request allowed') },
    };
  }

  if (verdictName === VERDICT_MASK) {
    const masked = applyReplacements(textArray, response.replacements);
    // All-or-nothing. A single out-of-range or malformed replacement blocks the whole verdict
    // rather than being silently skipped, so content Alice meant to replace can never reach the
    // model alongside content that was replaced.
    if (!masked) {
      return {
        error: null,
        verdict: false,
        data: {
          explanation: explanation(
            response.message ||
              'Content could not be masked as instructed and was blocked instead'
          ),
        },
      };
    }

    const transformedData: Record<string, any> = {
      request: { json: null },
      response: { json: null },
    };
    setCurrentContentPart(context, eventType, transformedData, masked);

    return {
      error: null,
      verdict: true,
      data: { explanation: explanation('Flagged content was masked') },
      transformedData,
      transformed: true,
    };
  }

  return {
    error: null,
    verdict: true,
    data: response.categories?.length
      ? { explanation: explanation('Allowed') }
      : null,
  };
}

/**
 * Portkey's trace id, read case-insensitively: the gateway lowercases the headers it looks up
 * itself, but a plugin is handed whatever casing the client sent.
 */
function readTraceId(context: PluginContext): string | undefined {
  const headers = context.request?.headers;
  if (!headers) return undefined;
  const key = Object.keys(headers).find(
    (name) => name.toLowerCase() === TRACE_ID_HEADER
  );
  return key ? headers[key] : undefined;
}

/**
 * The text list with each replacement written onto the text it names, or null when the verdict
 * cannot be applied in full — see the all-or-nothing note at the call site.
 */
function applyReplacements(
  textArray: Array<string>,
  replacements: AliceReplacement[] | undefined
): Array<string> | null {
  if (!replacements?.length) return null;

  const masked = [...textArray];
  for (const replacement of replacements) {
    const index = replacement?.index;
    const text = replacement?.text;
    if (
      typeof index !== 'number' ||
      !Number.isInteger(index) ||
      typeof text !== 'string' ||
      index < 0 ||
      index >= masked.length
    ) {
      return null;
    }
    masked[index] = text;
  }
  return masked;
}

/**
 * Copy `value` into something `JSON.stringify` accepts, dropping only what cannot cross.
 *
 * What is dropped is decided by a mechanical rule rather than a field list: a list drifts from what
 * the far side needs, a rule cannot. `stripKeys` drops a key by name at every depth it appears, so
 * a credential nested under any path is caught the same way a top-level one is. The source object
 * is never mutated — every branch below builds a new container.
 */
function jsonSafe(
  value: any,
  depth: number,
  seen: any[],
  stripKeys: string[]
): any {
  if (value === null || value === undefined) return null;
  const kind = typeof value;
  if (kind === 'number') return Number.isFinite(value) ? value : null;
  if (kind === 'string' || kind === 'boolean') return value;
  if (kind !== 'object') return null;
  if (depth >= MAX_DEPTH || seen.includes(value)) return null;

  const nested = [...seen, value];

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ITEMS)
      .map((item) => jsonSafe(item, depth + 1, nested, stripKeys));
  }

  const out: Record<string, any> = {};
  for (const key of Object.keys(value).slice(0, MAX_ITEMS)) {
    if (stripKeys.includes(key)) continue;
    out[key] = jsonSafe(value[key], depth + 1, nested, stripKeys);
  }
  return out;
}
