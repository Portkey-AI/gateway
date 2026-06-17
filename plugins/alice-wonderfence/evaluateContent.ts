import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getText, setCurrentContentPart } from '../utils';
import { WonderFenceV2Client, Actions } from '@alice-io/wonderfence-ts-sdk';
import type {
  AnalysisContext,
  CustomField,
} from '@alice-io/wonderfence-ts-sdk';
import { WonderfenceCredentials } from './globals';

const LOG_PREFIX = '[alice-wonderfence]';

/**
 * Resolve (apiKey, appId) for this call, mirroring the LiteLLM guardrail's
 * precedence: admin-pinned config credentials win, then — only when
 * `allowRequestMetadataOverride` is enabled — caller-supplied request metadata,
 * then (apiKey only) the ALICE_API_KEY env var.
 *
 * In Portkey the admin-pinned source is the guardrail `credentials` from the
 * config attached to the Portkey API key (so per-team separation = a distinct
 * config per key). `context.metadata` is the caller-controlled
 * `x-portkey-metadata` bucket, gated behind `allowRequestMetadataOverride` so a
 * caller cannot bypass their assigned WonderFence app.
 *
 * `appId` has no default — a missing appId is a misconfiguration, not a
 * fail-open condition.
 */
const resolveCredentials = (
  credentials: WonderfenceCredentials | undefined,
  metadata: Record<string, any> | undefined,
  allowRequestMetadataOverride: boolean
): { apiKey?: string; appId?: string } => {
  const fromOverride = (key: string): string | undefined =>
    allowRequestMetadataOverride ? metadata?.[key] : undefined;

  const apiKey =
    credentials?.apiKey ||
    fromOverride('alice_wonderfence_api_key') ||
    (typeof process !== 'undefined' ? process.env?.ALICE_API_KEY : undefined);

  const appId = credentials?.appId || fromOverride('alice_wonderfence_app_id');

  return { apiKey, appId };
};

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType,
  _options?: Record<string, any>
) => {
  let error = null;
  let verdict = true;
  let data = null;
  const transformedData = {
    request: { json: null },
    response: { json: null },
  };
  let transformed = false;
  const failOpen = parameters.failOpen !== false;

  try {
    const { apiKey, appId } = resolveCredentials(
      parameters.credentials as WonderfenceCredentials | undefined,
      context.metadata,
      parameters.allowRequestMetadataOverride === true
    );

    // Misconfiguration (no apiKey / appId resolvable) is never fail-open: a
    // misconfigured guardrail must not silently bypass scanning. This matches
    // the LiteLLM guardrail's WonderFenceMissingSecrets handling.
    //
    // The block reason is carried in `data`, NOT `error`: the gateway treats a
    // check that returns a truthy `error` as a pass unless `failOnError` is set
    // (see hooks aggregation `result.verdict || (result.error && !fail_on_error)`),
    // so returning an `error` here would silently fail open. `verdict: false`
    // with `error: null` is what actually denies the request.
    if (!apiKey) {
      return {
        error: null,
        verdict: false,
        data: { reason: 'alice_wonderfence apiKey is not configured' },
        transformedData,
        transformed,
      };
    }
    if (!appId) {
      return {
        error: null,
        verdict: false,
        data: { reason: 'alice_wonderfence appId is not configured' },
        transformedData,
        transformed,
      };
    }

    const client = new WonderFenceV2Client({
      apiKey,
      baseUrl: (parameters.credentials as WonderfenceCredentials | undefined)
        ?.baseUrl,
    });

    const text = getText(context, eventType);

    if (!text) {
      error = { message: 'request or response content is empty' };
      return { error, verdict, data, transformedData, transformed };
    }

    const traceId = context.request?.headers?.['x-portkey-trace-id'];

    const analysisContext: AnalysisContext = {
      sessionId:
        context.metadata?.session_id ||
        context.metadata?.sessionId ||
        context.metadata?.sessionID ||
        traceId,
      userId:
        context.metadata?.user_id ||
        context.metadata?._user ||
        context.metadata?.user,
      provider: context.provider,
      modelName: context.request?.json?.model,
    };

    let customFields: CustomField[] | undefined;
    if (typeof parameters.customFields === 'string') {
      customFields = JSON.parse(parameters.customFields);
    } else {
      customFields = parameters.customFields;
    }

    const result =
      eventType === 'beforeRequestHook'
        ? await client.evaluatePrompt(
            appId,
            analysisContext,
            text,
            undefined,
            customFields
          )
        : await client.evaluateResponse(
            appId,
            analysisContext,
            text,
            undefined,
            customFields
          );

    const textExcerpt = text.substring(0, 100);

    data = {
      action: result.action,
      correlationId: result.correlationId,
      detections: result.detections,
      ...(parameters.debug === true && { textExcerpt }),
    };

    if (result.action === Actions.BLOCK) {
      console.log(
        LOG_PREFIX,
        'BLOCKING request, correlationId:',
        result.correlationId,
        'detections:',
        JSON.stringify(result.detections)
      );
      verdict = false;
    } else if (result.action === Actions.MASK && result.actionText) {
      console.log(
        LOG_PREFIX,
        'MASKING content, correlationId:',
        result.correlationId,
        'detections:',
        JSON.stringify(result.detections),
        ...(parameters.debug === true
          ? [
              'text excerpt:',
              textExcerpt,
              'masked excerpt:',
              result.actionText.substring(0, 100),
            ]
          : [])
      );
      setCurrentContentPart(context, eventType, transformedData, [
        result.actionText,
      ]);
      transformed = true;
    }
  } catch (e: any) {
    console.error(LOG_PREFIX, 'ERROR:', e.message || e);
    if (failOpen) {
      // Allow through on error. `error` is informational; with verdict true the
      // check passes regardless.
      error = { message: e.message, name: e.name };
      verdict = true;
    } else {
      // Fail closed: block. Reason goes in `data` (not `error`) so the gateway
      // actually denies — an errored check is otherwise counted as a pass.
      verdict = false;
      data = { reason: `evaluation error: ${e.message}` };
      error = null;
    }
  }

  return { error, verdict, data, transformedData, transformed };
};
