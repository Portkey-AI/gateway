import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import {
  getText,
  getCurrentContentPart,
  setCurrentContentPart,
  HttpError,
  post,
} from '../utils';
import {
  applyMasksToMessages,
  isOnlyPiiViolation,
  type PayloadItem,
} from './redaction';

function portkeyMetadataToLakera(
  meta: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!meta || typeof meta !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  const u = meta._user ?? meta.user_id;
  if (u != null) out.user_id = String(u);
  if (meta.session_id != null) out.session_id = String(meta.session_id);
  if (meta.ip_address != null) out.ip_address = String(meta.ip_address);
  return Object.keys(out).length ? out : undefined;
}

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error: any = null;
  let verdict = false;
  let data: any = null;
  let transformed = false;
  const transformedData: Record<string, any> = {
    request: { json: null, text: null },
    response: { json: null, text: null },
  };

  try {
    const apiKey = parameters.credentials?.apiKey as string | undefined;
    if (!apiKey) {
      throw new Error(
        'Missing Lakera apiKey: set credentials.apiKey in the guardrail config'
      );
    }
    const projectID = parameters.project_id ?? parameters.projectID;

    const text = getText(context, eventType);
    if (!text) {
      return {
        error: null,
        verdict: true,
        data: { explanation: 'no messages to screen' },
      };
    }

    const { textArray } = getCurrentContentPart(context, eventType);

    const role = eventType === 'afterRequestHook' ? 'assistant' : 'user';
    const messages = textArray
      .filter((t) => t)
      .map((t) => ({ role, content: t }));

    const apiBase = String(
      (parameters.credentials?.apiBase as string | undefined) ??
        'https://api.lakera.ai'
    ).replace(/\/$/, '');
    const url = `${apiBase}/v2/guard`;
    const body: Record<string, unknown> = {
      messages,
      payload: true,
      breakdown: true,
    };
    if (projectID) {
      body.project_id = projectID;
    }
    const lm = portkeyMetadataToLakera(
      context.metadata as Record<string, unknown>
    );
    if (lm) body.metadata = lm;

    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    const lakeraResp: any = await post(
      url,
      body,
      { headers },
      parameters.timeout || 30000
    );

    const flagged = Boolean(lakeraResp.flagged);
    const breakdown = lakeraResp.breakdown || [];
    const payload = (lakeraResp.payload || []) as PayloadItem[];

    const safeLog = { ...lakeraResp };
    delete safeLog.payload;
    delete safeLog.breakdown;
    data = {
      lakera: {
        ...safeLog,
        detectedTypes: breakdown
          .filter((b: any) => b.detected)
          .map((b: any) => b.detector_type),
      },
    };

    if (!flagged) {
      verdict = true;
      return { error, verdict, data };
    }

    const endInclusive = Boolean(parameters.endInclusive);

    if (isOnlyPiiViolation(breakdown) && payload.length > 0) {
      const { messages: maskedMsgs, warnings } = applyMasksToMessages(
        messages,
        payload,
        endInclusive
      );

      if (warnings.some((w) => w.includes('multimodal'))) {
        verdict = false;
        return {
          error,
          verdict,
          data: {
            ...data,
            warnings,
            explanation:
              'multimodal content cannot be masked in this plugin build',
          },
        };
      }

      const maskedTextArray = maskedMsgs.map(
        (m) => (m.content as string) ?? ''
      );
      setCurrentContentPart(context, eventType, transformedData, maskedTextArray);
      transformed = true;

      verdict = true;
      return {
        error,
        verdict,
        data: { ...data, warnings },
        transformedData,
        transformed,
      };
    }

    verdict = false;
    return { error, verdict, data };
  } catch (e: any) {
    error = e;
    verdict = false;
    if (e instanceof HttpError) {
      data = { httpStatus: e.response?.status, body: e.response?.body };
    }
    return { error, verdict, data };
  }
};
