import { HookEventType, PluginContext } from '../types';

export type JsonRecord = Record<string, unknown>;

export const SUPPORTED_REQUEST_TYPES = [
  'chatComplete',
  'complete',
  'messages',
] as const;

export type SupportedRequestType = (typeof SUPPORTED_REQUEST_TYPES)[number];

export type ChatMessage = {
  role: string;
  content?: unknown;
  tool_calls?: unknown;
};

export type EvaluatePayload = {
  messages: ChatMessage[];
  tools?: unknown;
};

export type TransformedData = {
  request: { json: JsonRecord | null };
  response: { json: JsonRecord | null };
};

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSupportedRequestType(
  value: unknown
): value is SupportedRequestType {
  return (
    value === 'chatComplete' || value === 'complete' || value === 'messages'
  );
}

export function emptyTransformedData(): TransformedData {
  return {
    request: { json: null },
    response: { json: null },
  };
}

export function targetOf(eventType: HookEventType): 'request' | 'response' {
  return eventType === 'beforeRequestHook' ? 'request' : 'response';
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value.role !== 'string' || !value.role) {
    return false;
  }
  if (value.content !== undefined && value.content !== null) {
    return true;
  }
  return Array.isArray(value.tool_calls);
}

export function asMessages(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  if (!value.every(isChatMessage)) {
    return null;
  }
  return value;
}

function firstChoice(json: JsonRecord): JsonRecord | null {
  const choices = json.choices;
  if (!Array.isArray(choices) || !isRecord(choices[0])) {
    return null;
  }
  return choices[0];
}

function hasNonTextBlocks(content: unknown): boolean {
  if (!Array.isArray(content)) {
    return false;
  }
  return content.some(
    (part) => isRecord(part) && part.type !== undefined && part.type !== 'text'
  );
}

function withTools(messages: ChatMessage[], json: JsonRecord): EvaluatePayload {
  if (json.tools === undefined) {
    return { messages };
  }
  return { messages, tools: json.tools };
}

function extractChatCompleteInput(json: JsonRecord): EvaluatePayload | null {
  const messages = asMessages(json.messages);
  if (!messages) {
    return null;
  }
  return withTools(messages, json);
}

function extractCompleteInput(json: JsonRecord): EvaluatePayload | null {
  const prompt = json.prompt;
  if (typeof prompt === 'string' && prompt) {
    return { messages: [{ role: 'user', content: prompt }] };
  }
  if (
    Array.isArray(prompt) &&
    prompt.length > 0 &&
    prompt.every((item) => typeof item === 'string' && item)
  ) {
    return {
      messages: prompt.map((content) => ({ role: 'user', content })),
    };
  }
  return null;
}

function extractMessagesInput(json: JsonRecord): EvaluatePayload | null {
  const messages = asMessages(json.messages);
  if (!messages) {
    return null;
  }
  const next = [...messages];
  if (json.system !== undefined && json.system !== null && json.system !== '') {
    next.unshift({ role: 'system', content: json.system });
  }
  return withTools(next, json);
}

function extractChatCompleteOutput(json: JsonRecord): EvaluatePayload | null {
  const choice = firstChoice(json);
  if (!choice) {
    return null;
  }
  const message = choice.message;
  if (!isRecord(message)) {
    return null;
  }
  const payload: ChatMessage = {
    role: 'assistant',
    content: message.content,
  };
  if (message.tool_calls !== undefined) {
    payload.tool_calls = message.tool_calls;
  }
  if (!isChatMessage(payload)) {
    return null;
  }
  return { messages: [payload] };
}

function extractCompleteOutput(json: JsonRecord): EvaluatePayload | null {
  const choice = firstChoice(json);
  if (!choice || typeof choice.text !== 'string') {
    return null;
  }
  return { messages: [{ role: 'assistant', content: choice.text }] };
}

function extractMessagesOutput(json: JsonRecord): EvaluatePayload | null {
  const content = json.content;
  if (!Array.isArray(content) || content.length === 0) {
    return null;
  }
  if (!content.every(isRecord)) {
    return null;
  }
  return { messages: [{ role: 'assistant', content }] };
}

export function buildPayload(
  context: PluginContext,
  eventType: HookEventType
): EvaluatePayload | null {
  const requestType = context.requestType;
  if (!isSupportedRequestType(requestType)) {
    return null;
  }

  if (eventType === 'beforeRequestHook') {
    const json = context.request?.json;
    if (!isRecord(json)) {
      return null;
    }
    switch (requestType) {
      case 'chatComplete':
        return extractChatCompleteInput(json);
      case 'complete':
        return extractCompleteInput(json);
      case 'messages':
        return extractMessagesInput(json);
    }
  }

  const json = context.response?.json;
  if (!isRecord(json)) {
    return null;
  }
  switch (requestType) {
    case 'chatComplete':
      return extractChatCompleteOutput(json);
    case 'complete':
      return extractCompleteOutput(json);
    case 'messages':
      return extractMessagesOutput(json);
  }
}

function applyChatCompleteRequest(
  json: JsonRecord,
  messages: ChatMessage[]
): JsonRecord | null {
  const original = asMessages(json.messages);
  if (!original || messages.length < original.length) {
    return null;
  }
  return { ...json, messages };
}

function applyCompleteRequest(
  json: JsonRecord,
  messages: ChatMessage[]
): JsonRecord | null {
  if (typeof json.prompt === 'string') {
    const last = messages[messages.length - 1];
    if (!last || typeof last.content !== 'string' || !last.content) {
      return null;
    }
    return { ...json, prompt: last.content };
  }
  if (Array.isArray(json.prompt)) {
    if (messages.length !== json.prompt.length) {
      return null;
    }
    const next: string[] = [];
    for (const message of messages) {
      if (typeof message.content !== 'string' || !message.content) {
        return null;
      }
      next.push(message.content);
    }
    return { ...json, prompt: next };
  }
  return null;
}

function applyAnthropicRequest(
  json: JsonRecord,
  messages: ChatMessage[]
): JsonRecord | null {
  const original = asMessages(json.messages);
  if (!original) {
    return null;
  }
  const hadSystem =
    json.system !== undefined && json.system !== null && json.system !== '';
  const systemMessages = messages.filter(
    (message) => message.role === 'system'
  );
  const rest = messages.filter((message) => message.role !== 'system');
  if (rest.length < original.length) {
    return null;
  }
  if (hadSystem && systemMessages.length === 0) {
    return null;
  }
  const next: JsonRecord = { ...json, messages: rest };
  if (systemMessages.length === 1) {
    next.system = systemMessages[0].content;
  } else if (systemMessages.length > 1) {
    next.system = systemMessages.map((message) => message.content);
  }
  return next;
}

function applyChatCompleteResponse(
  json: JsonRecord,
  last: ChatMessage
): JsonRecord | null {
  const choice = firstChoice(json);
  if (!choice) {
    return null;
  }
  const originalMessage = isRecord(choice.message) ? choice.message : {};
  const nextMessage: JsonRecord = {
    ...originalMessage,
    content:
      last.content !== undefined ? last.content : originalMessage.content,
  };
  if (Object.prototype.hasOwnProperty.call(last, 'tool_calls')) {
    if (
      !Array.isArray(last.tool_calls) ||
      !Array.isArray(originalMessage.tool_calls) ||
      last.tool_calls.length !== originalMessage.tool_calls.length
    ) {
      return null;
    }
    nextMessage.tool_calls = last.tool_calls;
  }
  const choices = json.choices as unknown[];
  return {
    ...json,
    choices: [{ ...choice, message: nextMessage }, ...choices.slice(1)],
  };
}

function applyCompleteResponse(
  json: JsonRecord,
  last: ChatMessage
): JsonRecord | null {
  const choice = firstChoice(json);
  if (!choice || typeof last.content !== 'string' || !last.content) {
    return null;
  }
  const choices = json.choices as unknown[];
  return {
    ...json,
    choices: [{ ...choice, text: last.content }, ...choices.slice(1)],
  };
}

function applyAnthropicResponse(
  json: JsonRecord,
  last: ChatMessage
): JsonRecord | null {
  if (typeof last.content === 'string') {
    if (hasNonTextBlocks(json.content)) {
      return null;
    }
    return { ...json, content: [{ type: 'text', text: last.content }] };
  }
  if (
    Array.isArray(last.content) &&
    last.content.length > 0 &&
    last.content.every(isRecord)
  ) {
    return { ...json, content: last.content };
  }
  return null;
}

function applyMessagesToRequest(
  json: JsonRecord,
  requestType: SupportedRequestType,
  messages: ChatMessage[]
): JsonRecord | null {
  switch (requestType) {
    case 'chatComplete':
      return applyChatCompleteRequest(json, messages);
    case 'complete':
      return applyCompleteRequest(json, messages);
    case 'messages':
      return applyAnthropicRequest(json, messages);
  }
}

function applyMessagesToResponse(
  json: JsonRecord,
  requestType: SupportedRequestType,
  last: ChatMessage
): JsonRecord | null {
  switch (requestType) {
    case 'chatComplete':
      return applyChatCompleteResponse(json, last);
    case 'complete':
      return applyCompleteResponse(json, last);
    case 'messages':
      return applyAnthropicResponse(json, last);
  }
}

export function applyMessagesTransform(
  context: PluginContext,
  eventType: HookEventType,
  transformedData: TransformedData,
  messages: ChatMessage[]
): boolean {
  const requestType = context.requestType;
  if (!isSupportedRequestType(requestType)) {
    return false;
  }
  const target = targetOf(eventType);
  const json = context[target]?.json;
  if (!isRecord(json)) {
    return false;
  }

  if (target === 'request') {
    const next = applyMessagesToRequest(json, requestType, messages);
    if (!next) {
      return false;
    }
    transformedData.request.json = next;
    return true;
  }

  const last = messages[messages.length - 1];
  if (!last) {
    return false;
  }
  const next = applyMessagesToResponse(json, requestType, last);
  if (!next) {
    return false;
  }
  transformedData.response.json = next;
  return true;
}

function applyInputToRequest(
  json: JsonRecord,
  requestType: SupportedRequestType,
  redacted: string
): JsonRecord | null {
  if (requestType === 'complete') {
    if (typeof json.prompt !== 'string') {
      return null;
    }
    return { ...json, prompt: redacted };
  }

  const messages = json.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return null;
  }
  const last = messages[messages.length - 1];
  if (!isRecord(last)) {
    return null;
  }
  if (typeof last.content === 'string') {
    const next = [...messages];
    next[next.length - 1] = { ...last, content: redacted };
    return { ...json, messages: next };
  }
  if (Array.isArray(last.content) && last.content.length === 1) {
    const part = last.content[0];
    if (!isRecord(part) || hasNonTextBlocks(last.content)) {
      return null;
    }
    const next = [...messages];
    next[next.length - 1] = {
      ...last,
      content: [{ ...part, text: redacted }],
    };
    return { ...json, messages: next };
  }
  return null;
}

export function applyInputTransform(
  context: PluginContext,
  eventType: HookEventType,
  transformedData: TransformedData,
  redacted: string
): boolean {
  const requestType = context.requestType;
  if (!isSupportedRequestType(requestType)) {
    return false;
  }
  const target = targetOf(eventType);
  const json = context[target]?.json;
  if (!isRecord(json)) {
    return false;
  }

  if (target === 'request') {
    const next = applyInputToRequest(json, requestType, redacted);
    if (!next) {
      return false;
    }
    transformedData.request.json = next;
    return true;
  }

  const next = applyMessagesToResponse(json, requestType, {
    role: 'assistant',
    content: redacted,
  });
  if (!next) {
    return false;
  }
  transformedData.response.json = next;
  return true;
}

export function applyTransform(
  context: PluginContext,
  eventType: HookEventType,
  transformedData: TransformedData,
  transformed: unknown
): boolean {
  if (!isRecord(transformed)) {
    return false;
  }

  const messages = asMessages(transformed.messages);
  if (messages) {
    return applyMessagesTransform(
      context,
      eventType,
      transformedData,
      messages
    );
  }

  const input = transformed.input;
  if (typeof input !== 'string' || !input) {
    return false;
  }
  return applyInputTransform(context, eventType, transformedData, input);
}
