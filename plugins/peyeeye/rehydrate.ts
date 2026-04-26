import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getCurrentContentPart, setCurrentContentPart } from '../utils';
import {
  buildCacheKey,
  callDeleteSession,
  callRehydrate,
  PEyeEyeCachedSession,
  PEyeEyeCredentials,
  PEyeEyeError,
} from './globals';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType,
  options
) => {
  let error: any = null;
  let verdict = true;
  let data: any = null;
  const transformedData: Record<string, any> = {
    request: { json: null },
    response: { json: null },
  };
  let transformed = false;

  try {
    const credentials = parameters.credentials as
      | PEyeEyeCredentials
      | undefined;
    if (!credentials || !credentials.apiKey) {
      throw new PEyeEyeError('peyeeye api key not given');
    }

    if (!options?.getFromCacheByKey) {
      // No cache wired up at all — nothing to rehydrate.
      return {
        error: null,
        verdict: true,
        data: null,
        transformedData,
        transformed: false,
      };
    }

    const cacheKey = buildCacheKey(context);
    const cached = (await (options.getFromCacheByKey as any)(
      options.env,
      cacheKey
    )) as PEyeEyeCachedSession | string | null | undefined;

    if (!cached) {
      // No redaction happened on this request (or the entry expired) — no-op.
      return {
        error: null,
        verdict: true,
        data: null,
        transformedData,
        transformed: false,
      };
    }

    let sessionId: string;
    let cachedSessionMode: 'stateful' | 'stateless';
    if (typeof cached === 'string') {
      sessionId = cached;
      cachedSessionMode =
        (parameters.sessionMode as 'stateful' | 'stateless') || 'stateful';
    } else {
      sessionId = cached.sessionId;
      cachedSessionMode = cached.sessionMode || 'stateful';
    }

    const { content, textArray } = getCurrentContentPart(context, eventType);
    if (!content) {
      return {
        error: null,
        verdict: true,
        data: null,
        transformedData,
        transformed: false,
      };
    }

    const rehydrated: Array<string | null> = [];
    for (const text of textArray) {
      if (typeof text === 'string' && text.length > 0) {
        const out = await callRehydrate(credentials, text, sessionId);
        rehydrated.push(out);
      } else {
        rehydrated.push(text ?? null);
      }
    }

    setCurrentContentPart(context, eventType, transformedData, rehydrated);
    transformed = true;

    // Best-effort: drop the server-side stateful session and clear the cache.
    const sessionMode =
      (parameters.sessionMode as 'stateful' | 'stateless') || cachedSessionMode;
    if (sessionMode === 'stateful' && sessionId.startsWith('ses_')) {
      try {
        await callDeleteSession(credentials, sessionId);
      } catch (deleteError) {
        // Swallow — cleanup is best-effort.
      }
    }
    if (options?.putInCacheWithValue) {
      try {
        // Overwrite with a tombstone (null) so future lookups no-op. Some
        // cache backends don't support delete; null + short ttl is portable.
        await (options.putInCacheWithValue as any)(
          options.env,
          cacheKey,
          null,
          1
        );
      } catch (cacheError) {
        // Best-effort.
      }
    }

    data = { sessionId, sessionMode, rehydratedCount: rehydrated.length };
  } catch (e: any) {
    if (e && e.stack) delete e.stack;
    error = e;
    verdict = true;
  }

  return { error, verdict, data, transformedData, transformed };
};
