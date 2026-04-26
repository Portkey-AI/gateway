import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getCurrentContentPart, setCurrentContentPart } from '../utils';
import {
  buildCacheKey,
  callRedact,
  PEyeEyeCachedSession,
  PEyeEyeCredentials,
  PEyeEyeError,
  SESSION_CACHE_TTL_SECONDS,
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

    const { content, textArray } = getCurrentContentPart(context, eventType);

    if (!content) {
      return {
        error: { message: 'request json is empty' },
        verdict: true,
        data: null,
        transformedData,
        transformed,
      };
    }

    // Filter out empty/null entries and remember their original positions so
    // we can splice the redacted strings back in at the right indices.
    const inputTexts: string[] = [];
    const inputIndices: number[] = [];
    textArray.forEach((t, i) => {
      if (t && typeof t === 'string') {
        inputTexts.push(t);
        inputIndices.push(i);
      }
    });

    if (inputTexts.length === 0) {
      return {
        error: null,
        verdict: true,
        data: null,
        transformedData,
        transformed: false,
      };
    }

    const locale = (parameters.locale as string) || 'auto';
    const entities = parameters.entities as string[] | undefined;
    const sessionMode: 'stateful' | 'stateless' =
      parameters.sessionMode === 'stateless' ? 'stateless' : 'stateful';

    const { redacted, sessionId } = await callRedact(
      credentials,
      inputTexts,
      locale,
      entities,
      sessionMode
    );

    // Splice redacted strings back into the full textArray (preserves any
    // null/empty slots) so setCurrentContentPart can rewrite the original
    // structure verbatim.
    const fullTextArray: Array<string | null> = textArray.map((t) =>
      t ? null : null
    );
    inputIndices.forEach((origIdx, k) => {
      fullTextArray[origIdx] = redacted[k];
    });

    setCurrentContentPart(context, eventType, transformedData, fullTextArray);
    transformed = true;

    if (sessionId && options?.putInCacheWithValue) {
      const cacheKey = buildCacheKey(context);
      const cached: PEyeEyeCachedSession = {
        sessionId,
        sessionMode,
      };
      try {
        // The runtime cache helper signature is (env, key, value, ttl). We
        // call through both shapes so unit tests with simpler mocks (env
        // omitted) still observe the put.
        await (options.putInCacheWithValue as any)(
          options.env,
          cacheKey,
          cached,
          SESSION_CACHE_TTL_SECONDS
        );
      } catch (cacheError) {
        // Caching is best-effort; the redaction itself already succeeded.
      }
    }

    data = {
      sessionId: sessionId,
      sessionMode,
      redactedCount: redacted.length,
    };
  } catch (e: any) {
    if (e && e.stack) delete e.stack;
    error = e;
    verdict = true; // never "fail" the request — surface the error to the gateway
  }

  return { error, verdict, data, transformedData, transformed };
};
