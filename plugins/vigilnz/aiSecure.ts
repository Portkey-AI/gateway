/**
 * File: aiSecure.ts
 * Description: Portkey adapter for Vigilnz AI Secure. Maps Portkey's guardrail hook
 *              contract onto the gateway-neutral Vigilnz Guardrail Scan API and maps the
 *              verdict back to a Portkey verdict / transformedData. All security decisions
 *              are made by Vigilnz AI Secure; none are reimplemented here.
 * Author: Susenthiran S (susenthiran.s@vigilnz.com)
 * Creation date: 2026-08-13
 */

import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getCurrentContentPart, setCurrentContentPart } from '../utils';
import { scanWithVigilnz, VIGILNZ_DEFAULT_TIMEOUT_MS } from './client';
import {
  VigilnzCredentials,
  VigilnzScanRequest,
  VigilnzScanResponse,
  VigilnzStage,
} from './types';

/** Identifies this adapter to Vigilnz for logging and analytics. */
const GATEWAY_NAME = 'portkey';

/** Metadata keys Portkey users commonly use to carry a conversation id. */
const SESSION_METADATA_KEYS = ['_session_id', 'session_id', '_conversation_id'];

/**
 * Enforcement mode in which Vigilnz reports threats without acting on them. The verdict
 * still arrives as `action: 'allow'`, so this only affects how the outcome is explained.
 */
const MONITOR_ENFORCEMENT = 'monitor';

/**
 * Read the session id from Portkey request metadata, if the caller supplies one.
 * @param metadata - Portkey request metadata.
 * @returns Session id, or undefined.
 */
function resolveSessionId(
  metadata: Record<string, unknown> | undefined
): string | undefined {
  for (const key of SESSION_METADATA_KEYS) {
    const value = metadata?.[key];
    if (typeof value === 'string' && value) return value;
  }
  return undefined;
}

/**
 * Build the neutral Vigilnz scan request for this hook invocation.
 * @param context - Portkey plugin context.
 * @param eventType - Hook being executed.
 * @param textArray - Text parts of the current content part.
 * @param shouldRedact - Whether the user enabled redaction on this guardrail.
 * @returns Neutral scan request.
 */
function buildScanRequest(
  context: PluginContext,
  eventType: HookEventType,
  textArray: string[],
  shouldRedact: boolean
): VigilnzScanRequest {
  const stage: VigilnzStage =
    eventType === 'beforeRequestHook' ? 'input' : 'output';
  const text = textArray.filter((part) => part).join('\n');
  const model = context.request?.json?.model;

  return {
    stage,
    gateway: GATEWAY_NAME,
    redact: shouldRedact,
    ...(stage === 'input'
      ? { messages: [{ role: 'user', content: text }] }
      : { text }),
    ...(typeof model === 'string' ? { model } : {}),
    ...(context.provider ? { provider: context.provider } : {}),
    ...(resolveSessionId(context.metadata)
      ? { session_id: resolveSessionId(context.metadata) as string }
      : {}),
  };
}

/**
 * Build the human-readable explanation Portkey shows in guardrail logs.
 *
 * An allow verdict has two very different meanings: the content was clean, or the content
 * tripped a policy that this tenant runs in monitor mode. Both arrive as `action: 'allow'`,
 * so they are worded differently to keep guardrail logs readable. This affects wording only;
 * enforcement is decided solely by `verdict.action`.
 *
 * @param verdict - Vigilnz verdict.
 * @returns Explanation string.
 */
function buildExplanation(verdict: VigilnzScanResponse): string {
  const threat = verdict.threats?.[0];
  const suffix = threat ? ` (${threat.category})` : '';
  if (verdict.action === 'block') {
    return `Blocked by Vigilnz AI Secure: ${verdict.reason}${suffix}`;
  }
  if (verdict.action === 'modify') {
    return `Content redacted by Vigilnz AI Secure: ${verdict.reason}${suffix}`;
  }

  const isMonitored =
    verdict.enforcement?.toLowerCase() === MONITOR_ENFORCEMENT &&
    Boolean(threat);
  if (isMonitored) {
    return `Detected but not enforced by Vigilnz AI Secure (monitor mode): ${verdict.reason}${suffix}`;
  }

  return `Allowed by Vigilnz AI Secure: ${verdict.reason}`;
}

export const handler: PluginHandler<VigilnzCredentials> = async (
  context: PluginContext,
  parameters: PluginParameters<VigilnzCredentials>,
  eventType: HookEventType,
  options?: { env: Record<string, unknown> }
) => {
  const transformedData: Record<string, { json: unknown }> = {
    request: { json: null },
    response: { json: null },
  };

  try {
    const { textArray } = getCurrentContentPart(context, eventType);
    const text = textArray.filter((part) => part).join('\n');

    // Nothing scannable on this hook (e.g. streaming chunk with no content yet).
    if (!text) {
      return {
        error: null,
        verdict: true,
        data: { explanation: 'No text content to scan', action: 'allow' },
      };
    }

    const shouldRedact = parameters.redact === true;
    const verdict = await scanWithVigilnz(
      parameters.credentials,
      buildScanRequest(context, eventType, textArray, shouldRedact),
      (parameters.timeout as number) || VIGILNZ_DEFAULT_TIMEOUT_MS,
      options?.env
    );

    const data = {
      action: verdict.action,
      decision: verdict.decision,
      explanation: buildExplanation(verdict),
      threats: verdict.threats,
      enforcement: verdict.enforcement,
      scanId: verdict.scan_id,
      vigilnzLatencyMs: verdict.latency_ms,
    };

    if (verdict.action === 'block') {
      return { error: null, verdict: false, data };
    }

    if (verdict.action === 'modify' && verdict.modified_content) {
      // Defence in depth: only ever rewrite content the user asked to have redacted.
      // Substituting an unrequested `modify` would silently corrupt the prompt or
      // completion with no error and nothing in the logs, so an unexpected rewrite is
      // downgraded to `allow` and surfaced in the explanation instead.
      if (!shouldRedact) {
        return {
          error: null,
          verdict: true,
          data: {
            ...data,
            action: 'allow',
            ignoredAction: 'modify',
            explanation:
              'Vigilnz AI Secure returned a modification that was not requested (redact is disabled); content left unchanged',
          },
        };
      }

      setCurrentContentPart(context, eventType, transformedData, [
        verdict.modified_content,
      ]);
      return {
        error: null,
        verdict: true,
        data,
        transformedData,
        transformed: true,
      };
    }

    return { error: null, verdict: true, data };
  } catch (e: unknown) {
    const error =
      e instanceof Error ? e : new Error('Vigilnz guardrail failed');
    delete error.stack;

    // Portkey's own failure policy applies: an errored check only fails the guardrail
    // when the user enabled `failOnError` on this guardrail.
    return {
      error,
      verdict: false,
      data: {
        action: 'error',
        explanation: `Vigilnz AI Secure error: ${error.message}`,
      },
    };
  }
};
