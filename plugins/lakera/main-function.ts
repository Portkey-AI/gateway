import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { HttpError, post } from '../utils';
import {
  applyMasksToMessages,
  isOnlyPiiViolation,
  type PayloadItem,
} from './redaction';

function normalizeMessages(messages: any[]): any[] {
  if (!messages?.length) return [];
  return messages.map((message: any) => {
    if (typeof message.content === 'string') return message;
    if (Array.isArray(message.content)) {
      const text = message.content.reduce(
        (acc: string, item: any) =>
          acc + (item?.type === 'text' ? `${item.text}\n` : ''),
        ''
      );
      return { ...message, content: text };
    }
    return message;
  });
}

function extractMessages(
  context: PluginContext,
  eventType: HookEventType
): any[] {
  const reqJson = context.request?.json || {};
  let messages = reqJson.messages;
  if (messages && Array.isArray(messages)) {
    const base = JSON.parse(JSON.stringify(messages));
    const normalized = normalizeMessages(base);
    if (eventType === 'afterRequestHook') {
      const rjson = context.response?.json || {};
      const choices = rjson.choices || [];
      const ch0 = choices[0];
      if (ch0?.message && ch0.message.content != null) {
        normalized.push({
          role: ch0.message.role || 'assistant',
          content: ch0.message.content,
        });
      }
    }
    return normalized;
  }
  const text = context.request?.text;
  if (typeof text === 'string' && text.trim()) {
    const msgs: any[] = [{ role: 'user', content: text }];
    if (eventType === 'afterRequestHook') {
      const respText = context.response?.text;
      if (typeof respText === 'string' && respText.trim()) {
        msgs.push({ role: 'assistant', content: respText });
      }
    }
    return msgs;
  }
  return [];
}

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
    const projectID = parameters.projectID;

    const messages = extractMessages(context, eventType);
    if (!messages.length) {
      return {
        error: null,
        verdict: true,
        data: { explanation: 'no messages to screen' },
      };
    }

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
    // Strip raw spans (contain PII text positions) and internal Lakera IDs
    // (detector_id, policy_id, project_id) from caller-visible data.
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

      if (eventType === 'beforeRequestHook') {
        const reqJson = context.request?.json
          ? JSON.parse(JSON.stringify(context.request.json))
          : {};
        reqJson.messages = maskedMsgs;
        transformedData.request.json = reqJson;
        transformed = true;
      } else {
        const respJson = context.response?.json
          ? JSON.parse(JSON.stringify(context.response.json))
          : {};
        const choices = respJson.choices || [];
        if (choices[0]?.message && maskedMsgs.length > 0) {
          const last = maskedMsgs[maskedMsgs.length - 1];
          if (last && last.role === 'assistant') {
            choices[0].message = choices[0].message || {};
            choices[0].message.content = last.content;
            respJson.choices = choices;
          }
        }
        transformedData.response.json = respJson;
        transformed = true;
      }

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
    // Strip stack trace to avoid leaking internal file paths to callers.
    delete e?.stack;
    error = e;
    verdict = false;
    if (e instanceof HttpError) {
      data = { httpStatus: e.response?.status, body: e.response?.body };
    }
    return { error, verdict, data };
  }
};
