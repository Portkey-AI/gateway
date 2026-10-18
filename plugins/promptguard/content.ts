/**
 * Content-part readers and writers for the PromptGuard plugin.
 *
 * These follow the shape of `getCurrentContentPart` / `setCurrentContentPart`
 * in `../utils`, with three differences the guard depends on:
 *
 * - Responses: every choice is read and written (not only `choices[0]`), so
 *   an `n > 1` completion cannot return unscanned choices under `allow`.
 * - Writers treat `null` as "leave this position alone" and accept an empty
 *   string as a real replacement (`??`, not `||`).
 * - `embed` requests are writable, and Anthropic `messages` responses are
 *   written back into their content blocks rather than as bare strings.
 *
 * They are kept local to this plugin so the shared helpers, which other
 * plugins rely on, are unchanged.
 */

import { HookEventType, PluginContext } from '../types';

export const getContentParts = (
  context: PluginContext,
  eventType: HookEventType
): Array<string> => {
  const target = eventType === 'beforeRequestHook' ? 'request' : 'response';
  const json = context[target]?.json;
  if (!json) {
    // No body (e.g. streaming responses): nothing to scan.
    return [];
  }
  return target === 'request'
    ? getRequestParts(json, context.requestType || '')
    : getResponseParts(json, context.requestType || '');
};

const getRequestParts = (json: any, requestType: string): Array<string> => {
  if (requestType === 'chatComplete' || requestType === 'messages') {
    const content = json.messages?.[json.messages.length - 1]?.content;
    return Array.isArray(content)
      ? content.map((item: any) => item?.text || '')
      : [content];
  }
  if (requestType === 'complete') {
    return Array.isArray(json.prompt) ? [...json.prompt] : [json.prompt];
  }
  if (requestType === 'embed') {
    return Array.isArray(json.input) ? [...json.input] : [json.input];
  }
  return [];
};

const getResponseParts = (json: any, requestType: string): Array<string> => {
  if (requestType === 'chatComplete') {
    return (json.choices || []).map(
      (choice: any) => choice?.message?.content ?? ''
    );
  }
  if (requestType === 'complete') {
    return (json.choices || []).map((choice: any) => choice?.text ?? '');
  }
  if (requestType === 'messages') {
    return (json.content || []).map((item: any) => item?.text || '');
  }
  return [];
};

/**
 * Writes `textArray` into a shallow copy of the request or response JSON and
 * stores it on `transformedData`. The original context is never mutated.
 */
export const setContentParts = (
  context: PluginContext,
  eventType: HookEventType,
  transformedData: Record<string, any>,
  textArray: Array<string | null>
): void => {
  const target = eventType === 'beforeRequestHook' ? 'request' : 'response';
  const json = context[target]?.json;
  if (!json || textArray.length === 0) {
    return;
  }
  const requestType = context.requestType || '';
  if (target === 'request') {
    transformedData.request.json = setRequestParts(
      json,
      requestType,
      textArray
    );
  } else {
    transformedData.response.json = setResponseParts(
      json,
      requestType,
      textArray
    );
  }
};

const setRequestParts = (
  json: any,
  requestType: string,
  textArray: Array<string | null>
) => {
  const updated = { ...json };
  if (requestType === 'chatComplete' || requestType === 'messages') {
    updated.messages = [...json.messages];
    const last = { ...updated.messages[updated.messages.length - 1] };
    const original = last.content;
    last.content = Array.isArray(original)
      ? original.map((item: any, index: number) =>
          textArray[index] == null ? item : { ...item, text: textArray[index] }
        )
      : textArray[0] ?? original;
    updated.messages[updated.messages.length - 1] = last;
  } else if (requestType === 'complete') {
    updated.prompt = Array.isArray(json.prompt)
      ? json.prompt.map(
          (text: string, index: number) => textArray[index] ?? text
        )
      : textArray[0] ?? json.prompt;
  } else if (requestType === 'embed') {
    updated.input = Array.isArray(json.input)
      ? json.input.map(
          (text: string, index: number) => textArray[index] ?? text
        )
      : textArray[0] ?? json.input;
  }
  return updated;
};

const setResponseParts = (
  json: any,
  requestType: string,
  textArray: Array<string | null>
) => {
  const updated = { ...json };
  if (requestType === 'chatComplete') {
    updated.choices = json.choices.map((choice: any, index: number) =>
      textArray[index] == null
        ? choice
        : {
            ...choice,
            message: { ...choice.message, content: textArray[index] },
          }
    );
  } else if (requestType === 'complete') {
    updated.choices = json.choices.map((choice: any, index: number) =>
      textArray[index] == null ? choice : { ...choice, text: textArray[index] }
    );
  } else if (requestType === 'messages') {
    updated.content = json.content.map((item: any, index: number) =>
      textArray[index] == null ? item : { ...item, text: textArray[index] }
    );
  }
  return updated;
};
