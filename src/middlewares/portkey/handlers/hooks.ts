import { Context } from 'hono';
import { HookResult, HookResultWithLogDetails, WinkyLogObject } from '../types';
import { env } from 'hono/adapter';
import { forwardHookResultsToWinky } from './logger';
import { handleFeedback } from '../../../services/feedback';
import { logger } from '../../../apm';
import { internalServiceFetch } from '../../../utils/fetch';
import { fetchFromKVStore, putInKVStore } from './cache';

async function processFeedback(
  c: Context,
  hookResults: any,
  orgDetailsHeader: any,
  traceId: string
): Promise<any[]> {
  const feedbackPromises = hookResults.flatMap((hookResult: HookResult) => {
    if (hookResult.feedback && hookResult.feedback.value) {
      return handleFeedback(
        c,
        new Request(c.req.url, {
          headers: orgDetailsHeader,
          method: 'POST',
          body: JSON.stringify({
            ...hookResult.feedback,
            trace_id: traceId,
          }),
        }),
        env(c),
        'internal'
      );
    }
    return [];
  });

  return Promise.all(feedbackPromises);
}

export async function hookHandler(
  c: Context,
  hookSpanId: string,
  orgDetailsHeader: any,
  winkyLogObject: WinkyLogObject
): Promise<any> {
  try {
    const hooksManager = c.get('hooksManager');
    await hooksManager.executeHooks(
      hookSpanId,
      ['asyncBeforeRequestHook', 'asyncAfterRequestHook'],
      {
        env: env(c),
        getFromCacheByKey: (key: string, useMemCache: boolean = false) =>
          fetchFromKVStore(env(c), key, useMemCache),
        putInCacheWithValue: (key: string, value: any, expiry?: number) =>
          putInKVStore(env(c), key, value, expiry),
        internalServiceFetch: internalServiceFetch,
      }
    );

    const span = hooksManager.getSpan(hookSpanId);
    const results = span.getHooksResult();

    const guardrailVersionIdMap: Record<string, any> = {};
    // Create a map of guardrail id and version id for logging.
    // This is required because we cannot mention this in opensource code.
    span.getBeforeRequestHooks()?.forEach((brh: any) => {
      guardrailVersionIdMap[brh.id] = brh.guardrailVersionId || '';
    });
    span.getAfterRequestHooks()?.forEach((arh: any) => {
      guardrailVersionIdMap[arh.id] = arh.guardrailVersionId || '';
    });

    try {
      await processFeedback(
        c,
        [
          ...results.beforeRequestHooksResult,
          ...results.afterRequestHooksResult,
        ],
        orgDetailsHeader,
        winkyLogObject.traceId
      );
    } catch (feedackError: any) {
      logger.error({
        message: `processFeedback error: ${feedackError?.message}`,
      });
    }

    // Add event type to each result
    const beforeRequestHooksResultWithType: HookResultWithLogDetails[] =
      results.beforeRequestHooksResult.map(
        (result: HookResult): HookResultWithLogDetails => ({
          ...result,
          event_type: 'beforeRequestHook',
          guardrail_version_id: guardrailVersionIdMap[result.id] || '',
        })
      );

    const afterRequestHooksResultWithType: HookResultWithLogDetails[] =
      results.afterRequestHooksResult.map(
        (result: HookResult): HookResultWithLogDetails => ({
          ...result,
          event_type: 'afterRequestHook',
          guardrail_version_id: guardrailVersionIdMap[result.id] || '',
        })
      );

    const allResultsWithType = [
      ...beforeRequestHooksResultWithType,
      ...afterRequestHooksResultWithType,
    ];

    if (allResultsWithType.length > 0) {
      // Log the hook results
      await forwardHookResultsToWinky(env(c), {
        generation_id: winkyLogObject.id,
        trace_id: winkyLogObject.traceId,
        organisation_id: winkyLogObject.config.organisationDetails.id,
        workspace_slug:
          winkyLogObject.config.organisationDetails.workspaceDetails.slug,
        internal_trace_id: winkyLogObject.internalTraceId,
        results: allResultsWithType,
        organisation_details: winkyLogObject.config.organisationDetails,
      });
    }
    return true;
  } catch (err) {
    console.log('hooks err:', err);
    return false;
  }
}
