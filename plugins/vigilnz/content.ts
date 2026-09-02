/**
 * File: content.ts
 * Description: Content extraction and redaction write-back for the Vigilnz guardrail.
 *              Portkey's shared helpers model chatComplete/messages/complete/embed only, so
 *              Responses API traffic (requestType 'createModelResponse', content in
 *              `json.input` / `json.output`) yields no text and would silently skip scanning.
 *              This module tries the shared helpers first and handles those shapes itself,
 *              keeping the fix inside the plugin instead of changing shared gateway code.
 * Author: Susenthiran S (susenthiran.s@vigilnz.com)
 * Creation date: 2026-08-18
 */

import { HookEventType, PluginContext } from '../types';
import { getCurrentContentPart, setCurrentContentPart } from '../utils';

/**
 * Which payload shape the scanned text came from, and therefore where redacted text can be
 * written back. `none` means the text was recovered from Portkey's flattened
 * `request.text`/`response.text` and has no addressable location to rewrite.
 */
export type ContentKind =
  | 'standard'
  | 'responsesInput'
  | 'responsesOutput'
  | 'none';

export interface ExtractedContent {
  readonly textArray: string[];
  readonly kind: ContentKind;
}

/** Content-part types that carry text in the Responses API. */
const TEXT_PART_TYPES = ['input_text', 'output_text', 'text', 'summary_text'];

/** Roles treated as user-authored input on the request side. */
const USER_ROLES = ['user', 'human'];

/**
 * Read text from a Responses API content value: a plain string or an array of parts.
 * @param content - `content` value of one input/output item.
 * @returns Text parts found, in order.
 */
function readContentParts(content: unknown): string[] {
  if (typeof content === 'string') return content ? [content] : [];
  if (!Array.isArray(content)) return [];

  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (!part || typeof part !== 'object') return '';
      const record = part as Record<string, unknown>;
      const type = typeof record.type === 'string' ? record.type : '';
      // Accept a known text part type, or any part carrying a plain `text` string.
      if (type && !TEXT_PART_TYPES.includes(type)) return '';
      return typeof record.text === 'string' ? record.text : '';
    })
    .filter(Boolean);
}

/**
 * Extract the prompt from a Responses API request body (`json.input`).
 * Mirrors the chat path by scanning the last user-authored entry.
 * @param json - Request body.
 * @returns Text parts of the last user entry.
 */
function readResponsesInput(json: unknown): string[] {
  if (!json || typeof json !== 'object') return [];
  const input = (json as Record<string, unknown>).input;

  if (typeof input === 'string') return input ? [input] : [];
  if (!Array.isArray(input)) return [];

  for (let index = input.length - 1; index >= 0; index--) {
    const item = input[index] as Record<string, unknown> | string | null;
    if (typeof item === 'string') {
      if (item) return [item];
      continue;
    }
    if (!item || typeof item !== 'object') continue;

    const role = typeof item.role === 'string' ? item.role.toLowerCase() : '';
    if (role && !USER_ROLES.includes(role)) continue;

    const parts = readContentParts(item.content);
    if (parts.length) return parts;
  }
  return [];
}

/**
 * Extract the completion from a Responses API response body (`json.output`).
 * @param json - Response body.
 * @returns Text parts of the assistant message items.
 */
function readResponsesOutput(json: unknown): string[] {
  if (!json || typeof json !== 'object') return [];
  const record = json as Record<string, unknown>;
  const output = record.output;

  if (Array.isArray(output)) {
    const texts: string[] = [];
    for (const item of output) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as Record<string, unknown>;
      // Skip reasoning / tool-call items; only assistant messages carry user-visible text.
      if (typeof entry.type === 'string' && entry.type !== 'message') continue;
      texts.push(...readContentParts(entry.content));
    }
    if (texts.length) return texts;
  }

  const outputText = record.output_text;
  if (typeof outputText === 'string' && outputText) return [outputText];
  return [];
}

/**
 * Extract the text this hook should scan.
 * @param context - Portkey plugin context.
 * @param eventType - Hook being executed.
 * @returns Text parts plus the shape they came from.
 */
export function extractContent(
  context: PluginContext,
  eventType: HookEventType
): ExtractedContent {
  // Portkey's own helper first — unchanged behaviour for every request type it models.
  try {
    const { textArray } = getCurrentContentPart(context, eventType);
    if (textArray.some((part) => part)) {
      return { textArray, kind: 'standard' };
    }
  } catch {
    // The helper indexes into shapes it assumes exist; fall through to the branches below.
  }

  if (eventType === 'beforeRequestHook') {
    const parts = readResponsesInput(context.request?.json);
    if (parts.length) return { textArray: parts, kind: 'responsesInput' };
  } else {
    const parts = readResponsesOutput(context.response?.json);
    if (parts.length) return { textArray: parts, kind: 'responsesOutput' };
  }

  // Last resort: the flattened text Portkey's HookSpan already computed. Scannable, but
  // there is no addressable field to write redacted content back into.
  const fallback =
    eventType === 'beforeRequestHook'
      ? context.request?.text
      : context.response?.text;
  if (typeof fallback === 'string' && fallback) {
    return { textArray: [fallback], kind: 'none' };
  }

  return { textArray: [], kind: 'none' };
}

/**
 * Replace the first text part of a Responses API request body.
 * @param json - Original request body.
 * @param redactedText - Replacement text.
 * @returns Shallow clone with the prompt replaced.
 */
function writeResponsesInput(
  json: Record<string, unknown>,
  redactedText: string
): Record<string, unknown> {
  const updated = { ...json };
  const input = updated.input;

  if (typeof input === 'string') {
    updated.input = redactedText;
    return updated;
  }
  if (!Array.isArray(input)) return updated;

  const items = [...input];
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index];
    if (typeof item === 'string') {
      items[index] = redactedText;
      updated.input = items;
      return updated;
    }
    if (!item || typeof item !== 'object') continue;

    const entry = item as Record<string, unknown>;
    const role = typeof entry.role === 'string' ? entry.role.toLowerCase() : '';
    if (role && !USER_ROLES.includes(role)) continue;

    if (typeof entry.content === 'string') {
      items[index] = { ...entry, content: redactedText };
      updated.input = items;
      return updated;
    }
    if (Array.isArray(entry.content)) {
      items[index] = {
        ...entry,
        content: replaceFirstTextPart(entry.content, redactedText),
      };
      updated.input = items;
      return updated;
    }
  }
  return updated;
}

/**
 * Replace the first text part of a Responses API response body.
 * @param json - Original response body.
 * @param redactedText - Replacement text.
 * @returns Shallow clone with the completion replaced.
 */
function writeResponsesOutput(
  json: Record<string, unknown>,
  redactedText: string
): Record<string, unknown> {
  const updated = { ...json };
  const output = updated.output;

  if (Array.isArray(output)) {
    const items = [...output];
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      if (!item || typeof item !== 'object') continue;

      const entry = item as Record<string, unknown>;
      if (typeof entry.type === 'string' && entry.type !== 'message') continue;

      if (typeof entry.content === 'string') {
        items[index] = { ...entry, content: redactedText };
        updated.output = items;
        return updated;
      }
      if (Array.isArray(entry.content)) {
        items[index] = {
          ...entry,
          content: replaceFirstTextPart(entry.content, redactedText),
        };
        updated.output = items;
        return updated;
      }
    }
  }

  if (typeof updated.output_text === 'string') {
    updated.output_text = redactedText;
  }
  return updated;
}

/**
 * Replace the text of the first text-bearing part, leaving other parts untouched.
 * Mirrors `setCurrentContentPart`, which also rewrites only the parts it is given.
 * @param parts - Original content parts.
 * @param redactedText - Replacement text.
 * @returns New parts array.
 */
function replaceFirstTextPart(
  parts: unknown[],
  redactedText: string
): unknown[] {
  let replaced = false;
  return parts.map((part) => {
    if (replaced || !part || typeof part !== 'object') return part;
    const record = part as Record<string, unknown>;
    const type = typeof record.type === 'string' ? record.type : '';
    if (type && !TEXT_PART_TYPES.includes(type)) return part;
    if (typeof record.text !== 'string') return part;
    replaced = true;
    return { ...record, text: redactedText };
  });
}

/**
 * Write redacted text back into the payload Portkey will forward.
 * @param context - Portkey plugin context.
 * @param eventType - Hook being executed.
 * @param kind - Shape the text was extracted from.
 * @param redactedText - Redacted replacement text.
 * @param transformedData - Portkey transformedData object to populate.
 * @returns true when the content was actually rewritten.
 */
export function applyRedaction(
  context: PluginContext,
  eventType: HookEventType,
  kind: ContentKind,
  redactedText: string,
  transformedData: Record<string, { json: unknown }>
): boolean {
  if (kind === 'standard') {
    setCurrentContentPart(context, eventType, transformedData, [redactedText]);
    return true;
  }
  if (kind === 'responsesInput' && context.request?.json) {
    transformedData.request.json = writeResponsesInput(
      context.request.json as Record<string, unknown>,
      redactedText
    );
    return true;
  }
  if (kind === 'responsesOutput' && context.response?.json) {
    transformedData.response.json = writeResponsesOutput(
      context.response.json as Record<string, unknown>,
      redactedText
    );
    return true;
  }
  return false;
}
