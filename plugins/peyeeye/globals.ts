import { post } from '../utils';

export const DEFAULT_API_BASE = 'https://api.peyeeye.ai';
export const SESSION_CACHE_TTL_SECONDS = 3600;

export interface PEyeEyeCredentials {
  apiKey: string;
  apiBase?: string;
}

export interface PEyeEyeRedactRequest {
  text: string[];
  locale: string;
  entities?: string[];
  session?: 'stateless';
}

export interface PEyeEyeRedactResponse {
  text?: string | string[];
  session_id?: string;
  session?: string;
  rehydration_key?: string;
}

export interface PEyeEyeRehydrateResponse {
  text?: string;
  replaced?: number;
}

export interface PEyeEyeCachedSession {
  sessionId: string;
  sessionMode: 'stateful' | 'stateless';
}

export class PEyeEyeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PEyeEyeError';
  }
}

const trimBase = (base: string): string => base.replace(/\/+$/, '');

export const resolveApiBase = (credentials: PEyeEyeCredentials): string => {
  return trimBase(credentials.apiBase || DEFAULT_API_BASE);
};

export const buildHeaders = (apiKey: string): Record<string, string> => ({
  Authorization: `Bearer ${apiKey}`,
});

/**
 * POST /v1/redact — batch redact a list of text strings.
 *
 * Returns the redacted strings AND the session id (or sealed rehydration key
 * for stateless mode). Throws PEyeEyeError on any unexpected response shape —
 * we never silently forward unredacted text to the LLM as a fallback.
 */
export const callRedact = async (
  credentials: PEyeEyeCredentials,
  texts: string[],
  locale: string,
  entities: string[] | undefined,
  sessionMode: 'stateful' | 'stateless'
): Promise<{ redacted: string[]; sessionId: string | null }> => {
  const body: PEyeEyeRedactRequest = {
    text: texts,
    locale: locale || 'auto',
  };
  if (entities && entities.length > 0) {
    body.entities = entities;
  }
  if (sessionMode === 'stateless') {
    body.session = 'stateless';
  }

  const url = `${resolveApiBase(credentials)}/v1/redact`;
  const response = (await post(url, body, {
    headers: buildHeaders(credentials.apiKey),
  })) as PEyeEyeRedactResponse;

  let redacted: string[];
  if (Array.isArray(response.text)) {
    redacted = response.text.map((t) => String(t));
  } else if (typeof response.text === 'string') {
    redacted = [response.text];
  } else {
    throw new PEyeEyeError(
      'peyeeye /v1/redact returned unexpected response shape; refusing to forward unredacted text'
    );
  }

  if (redacted.length !== texts.length) {
    throw new PEyeEyeError(
      `peyeeye /v1/redact returned ${redacted.length} texts for ${texts.length} inputs; refusing to forward partially-redacted data`
    );
  }

  let sessionId: string | null = null;
  if (sessionMode === 'stateless') {
    sessionId = response.rehydration_key || null;
  } else {
    sessionId = response.session_id || response.session || null;
  }

  return { redacted, sessionId };
};

/**
 * POST /v1/rehydrate — swap placeholder tokens in `text` back to the original
 * PII using `sessionId` (either ses_… or skey_…). Returns the original `text`
 * on any error (best-effort) so a transient peyeeye outage doesn't break the
 * post-call hook.
 */
export const callRehydrate = async (
  credentials: PEyeEyeCredentials,
  text: string,
  sessionId: string
): Promise<string> => {
  if (!text) return text;
  const url = `${resolveApiBase(credentials)}/v1/rehydrate`;
  const response = (await post(
    url,
    { text, session: sessionId },
    { headers: buildHeaders(credentials.apiKey) }
  )) as PEyeEyeRehydrateResponse;
  if (typeof response.text !== 'string') {
    throw new PEyeEyeError(
      'peyeeye /v1/rehydrate returned unexpected response shape'
    );
  }
  return response.text;
};

/**
 * DELETE /v1/sessions/{sessionId} — best-effort cleanup of a stateful session.
 * Errors are intentionally swallowed by the caller.
 */
export const callDeleteSession = async (
  credentials: PEyeEyeCredentials,
  sessionId: string
): Promise<void> => {
  const url = `${resolveApiBase(credentials)}/v1/sessions/${encodeURIComponent(sessionId)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: buildHeaders(credentials.apiKey),
      signal: controller.signal,
    });
    if (!response.ok && response.status !== 404) {
      throw new PEyeEyeError(
        `peyeeye DELETE /v1/sessions/${sessionId} returned ${response.status}`
      );
    }
  } finally {
    clearTimeout(timer);
  }
};

export const buildCacheKey = (context: any): string => {
  const id =
    context?.metadata?.requestID ||
    context?.metadata?.requestId ||
    context?.requestId ||
    context?.metadata?.traceId ||
    'no-request-id';
  return `peyeeye:session:${id}`;
};
