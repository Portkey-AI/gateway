import { Context } from 'hono';
import {
  HookResult,
  HookResultWithLogDetails,
  LogObject,
  WinkyLogObject,
} from '../types';
import { addFeedback } from './feedback';
import { env } from 'hono/adapter';
import { forwardHookResultsToWinky, forwardLogsToWinky } from './logger';

async function processFeedback(
  c: Context,
  hookResults: any,
  orgDetailsHeader: any,
  traceId: string
): Promise<any[]> {
  const feedbackPromises = hookResults.flatMap((hookResult: HookResult) => {
    if (hookResult.feedback && hookResult.feedback.value) {
      return addFeedback(
        env(c),
        {
          ...hookResult.feedback,
          trace_id: traceId,
        },
        orgDetailsHeader
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
        getFromCacheByKey: c.get('getFromCacheByKey'),
        putInCacheWithValue: c.get('putInCacheWithValue'),
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

    await processFeedback(
      c,
      [...results.beforeRequestHooksResult, ...results.afterRequestHooksResult],
      orgDetailsHeader,
      winkyLogObject.traceId
    );

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

    const hookLogs: LogObject[] = [];

    // Find all checks that have a log object in it
    // and push it to the hookLogs array
    for (const { checks } of allResultsWithType) {
      for (const check of checks) {
        if (check.log) {
          // add traceId to the log object
          check.log.metadata.traceId = winkyLogObject.traceId;
          check.log.organisationDetails =
            winkyLogObject.config.organisationDetails;
          hookLogs.push(check.log);
          delete check.log;
        }
      }
    }

    // Send the hook logs to the `/v1/logs` endpoint
    if (hookLogs.length > 0) {
      await forwardLogsToWinky(env(c), hookLogs);
    }

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
