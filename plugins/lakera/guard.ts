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

type ScreeningMessage = { role: string; content: string };

/**
 * Tracks where each screening message came from so PII redaction can be written
 * back into the correct field (Anthropic system, request.messages[i], response, …).
 */
type MessageSource =
  | { type: 'anthropic_system'; originalContent: unknown }
  | { type: 'request_message'; index: number; originalContent: unknown }
  | { type: 'request_text' }
  | { type: 'response_openai'; originalContent: unknown }
  | { type: 'response_anthropic'; originalContent: unknown };

export function contentToScreeningText(content: unknown): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    const textParts: string[] = [];
    for (const item of content) {
      // Only text blocks are screened; images/tools are skipped (no text to send).
      if (item?.type === 'text' && item.text != null) {
        textParts.push(String(item.text));
      }
    }
    // Join blocks with newline — matches how Lakera indexes span offsets.
    return textParts.join('\n');
  }

  if (typeof content === 'object') {
    try {
      return JSON.stringify(content);
    } catch {
      return '';
    }
  }

  return String(content);
}

/** Build the Lakera Guard endpoint URL from an optional apiBase credential. */
export function resolveGuardUrl(apiBase?: string): string {
  const defaultBase = 'https://api.lakera.ai';
  // Trim whitespace and trailing slashes from user input.
  let base = String(apiBase ?? defaultBase)
    .trim()
    .replace(/\/+$/, '');

  // User may paste the full endpoint; strip /v2/guard so we do not double it.
  if (/\/v2\/guard$/i.test(base)) {
    base = base.replace(/\/v2\/guard$/i, '');
  }

  // Allow bare hostnames like "api.lakera.ai" without a scheme.
  if (!/^https?:\/\//i.test(base)) {
    base = `https://${base}`;
  }

  return `${base.replace(/\/+$/, '')}/v2/guard`;
}

/**
 * Write masked plain text back into the original content shape.
 * Strings stay strings; content block arrays update the first text block.
 */
function setContentFromMasked(
  originalContent: unknown,
  maskedText: string
): unknown {
  if (originalContent == null || typeof originalContent === 'string') {
    return maskedText;
  }

  if (Array.isArray(originalContent)) {
    const textBlockIndexes = originalContent
      .map((item, index) => (item?.type === 'text' ? index : -1))
      .filter((index) => index >= 0);

    if (textBlockIndexes.length === 0) {
      return [{ type: 'text', text: maskedText }];
    }

    const updated = originalContent.map((item) => ({ ...item }));
    updated[textBlockIndexes[0]].text = maskedText;
    // Clear extra text blocks — spans were computed on the joined string.
    for (let i = 1; i < textBlockIndexes.length; i++) {
      updated[textBlockIndexes[i]].text = '';
    }
    return updated;
  }

  return maskedText;
}

/**
 * Build the messages[] payload for Lakera and a parallel source map for redaction.
 * Returns null when there is nothing to screen.
 */
export function extractScreeningMessages(
  context: PluginContext,
  eventType: HookEventType
): { messages: ScreeningMessage[]; sources: MessageSource[] } | null {
  const reqJson = context.request?.json || {};
  const messages: ScreeningMessage[] = [];
  const sources: MessageSource[] = [];

  // Anthropic keeps system prompt outside messages[] — Lakera wants role "system".
  if (reqJson.system != null) {
    const text = contentToScreeningText(reqJson.system);
    if (text) {
      messages.push({ role: 'system', content: text });
      sources.push({
        type: 'anthropic_system',
        originalContent: reqJson.system,
      });
    }
  }

  if (Array.isArray(reqJson.messages)) {
    for (let i = 0; i < reqJson.messages.length; i++) {
      const msg = reqJson.messages[i];
      messages.push({
        role: msg?.role || 'user',
        content: contentToScreeningText(msg?.content),
      });
      sources.push({
        type: 'request_message',
        index: i,
        originalContent: msg?.content,
      });
    }
  }

  // After-hook: append the model response so Lakera can screen output too.
  if (eventType === 'afterRequestHook') {
    appendAssistantResponse(context, messages, sources);
  }

  // Fallback when the body has no messages[] (plain text hooks).
  if (messages.length === 0) {
    appendPlainTextFallback(context, eventType, messages, sources);
  }

  return messages.length ? { messages, sources } : null;
}

/** Append assistant text from the response JSON (Anthropic or OpenAI shape). */
function appendAssistantResponse(
  context: PluginContext,
  messages: ScreeningMessage[],
  sources: MessageSource[]
): void {
  const respJson = context.response?.json || {};

  if (context.requestType === 'messages' && Array.isArray(respJson.content)) {
    const text = contentToScreeningText(respJson.content);
    if (text) {
      messages.push({ role: 'assistant', content: text });
      sources.push({
        type: 'response_anthropic',
        originalContent: respJson.content,
      });
    }
    return;
  }

  const firstChoice = respJson.choices?.[0];
  if (firstChoice?.message?.content != null) {
    messages.push({
      role: firstChoice.message.role || 'assistant',
      content: contentToScreeningText(firstChoice.message.content),
    });
    sources.push({
      type: 'response_openai',
      originalContent: firstChoice.message.content,
    });
  } else if (firstChoice?.text != null) {
    messages.push({ role: 'assistant', content: String(firstChoice.text) });
    sources.push({
      type: 'response_openai',
      originalContent: firstChoice.text,
    });
  }
}

/** Last-resort extraction from request.text / response.text. */
function appendPlainTextFallback(
  context: PluginContext,
  eventType: HookEventType,
  messages: ScreeningMessage[],
  sources: MessageSource[]
): void {
  const text = context.request?.text;
  if (typeof text === 'string' && text.trim()) {
    messages.push({ role: 'user', content: text.trim() });
    sources.push({ type: 'request_text' });
  }

  if (eventType === 'afterRequestHook') {
    const respText = context.response?.text;
    if (typeof respText === 'string' && respText.trim()) {
      messages.push({ role: 'assistant', content: respText.trim() });
      sources.push({
        type: 'response_anthropic',
        originalContent: respText.trim(),
      });
    }
  }
}

/** Write Lakera PII masks back into the original Portkey request/response. */
function applyMaskedToContext(
  context: PluginContext,
  eventType: HookEventType,
  sources: MessageSource[],
  maskedMessages: Array<Record<string, unknown>>,
  transformedData: Record<string, any>
): boolean {
  if (sources.length !== maskedMessages.length) {
    return false;
  }

  const reqJson = context.request?.json
    ? JSON.parse(JSON.stringify(context.request.json))
    : {};
  const respJson = context.response?.json
    ? JSON.parse(JSON.stringify(context.response.json))
    : {};
  let requestChanged = false;
  let responseChanged = false;

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const maskedContent = String(maskedMessages[i].content ?? '');

    switch (source.type) {
      case 'anthropic_system':
        reqJson.system = setContentFromMasked(
          source.originalContent,
          maskedContent
        );
        requestChanged = true;
        break;
      case 'request_message':
        if (source.index >= 0 && Array.isArray(reqJson.messages)) {
          reqJson.messages[source.index] = {
            ...reqJson.messages[source.index],
            content: setContentFromMasked(
              source.originalContent,
              maskedContent
            ),
          };
          requestChanged = true;
        }
        break;
      case 'request_text':
        transformedData.request.text = maskedContent;
        requestChanged = true;
        break;
      case 'response_openai':
        if (respJson.choices?.[0]?.message) {
          respJson.choices[0].message = {
            ...respJson.choices[0].message,
            content: setContentFromMasked(
              source.originalContent,
              maskedContent
            ),
          };
          responseChanged = true;
        } else if (respJson.choices?.[0]) {
          respJson.choices[0].text = maskedContent;
          responseChanged = true;
        }
        break;
      case 'response_anthropic':
        respJson.content = setContentFromMasked(
          source.originalContent,
          maskedContent
        );
        responseChanged = true;
        break;
    }
  }

  if (requestChanged) {
    transformedData.request.json = reqJson;
  }
  if (responseChanged && eventType === 'afterRequestHook') {
    transformedData.response.json = respJson;
  }

  return requestChanged || responseChanged;
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

function formatHttpError(error: HttpError, url: string): Error {
  if (error.response?.status === 404) {
    return new Error(
      `Lakera Guard endpoint not found (${url}). Set apiBase to the host only (e.g. https://api.lakera.ai), not the /v2/guard path.`
    );
  }
  return error;
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

  const url = resolveGuardUrl(
    parameters.credentials?.apiBase as string | undefined
  );

  try {
    const apiKey = parameters.credentials?.apiKey as string | undefined;
    if (!apiKey) {
      throw new Error(
        'Missing Lakera apiKey: set credentials.apiKey in the guardrail config'
      );
    }
    const projectID = parameters.project_id ?? parameters.projectID;

    const extracted = extractScreeningMessages(context, eventType);
    if (
      !extracted?.messages.length ||
      !extracted.messages.some((m) => m.content.trim())
    ) {
      return {
        error: null,
        verdict: true,
        data: { explanation: 'no messages to screen' },
      };
    }

    const { messages, sources } = extracted;

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

    const lakeraResp: any = await post(
      url,
      body,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      },
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

      transformed = applyMaskedToContext(
        context,
        eventType,
        sources,
        maskedMsgs,
        transformedData
      );

      if (!transformed) {
        verdict = false;
        return {
          error,
          verdict,
          data: {
            ...data,
            warnings,
            explanation: 'PII detected but content could not be redacted',
          },
        };
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
    error = e instanceof HttpError ? formatHttpError(e, url) : e;
    verdict = false;
    if (e instanceof HttpError) {
      data = { httpStatus: e.response?.status, body: e.response?.body, url };
    }
    return { error, verdict, data };
  }
};
