import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { HttpError, post } from '../utils';

export const CATO_DEFAULT_BASE_URL = 'https://api.aisec.catonetworks.com';
export const CATO_ANALYZE_PATH = '/fw/v1/analyze';
export const CATO_HOOK_VERSION = 'portkey-gateway/1.0.0';

interface CatoCredentials {
  apiKey: string;
  apiBase?: string;
}

type CatoRole = 'system' | 'user' | 'assistant' | 'tool';

interface CatoContent {
  type: string;
  text: string;
}

interface CatoFunctionCall {
  name?: string;
  arguments?: string;
}

interface CatoToolCall {
  id?: string;
  type?: string;
  function?: CatoFunctionCall;
}

interface CatoOpenAIMessage {
  role: CatoRole;
  content?: CatoContent[];
  tool_calls?: CatoToolCall[];
  tool_call_id?: string;
  is_context?: boolean;
}

interface CatoAnalyzeRequest {
  messages: CatoOpenAIMessage[];
  tools?: Record<string, any>[];
  should_anonymize_monitor_action?: boolean;
  'x-cato-invocation-metadata'?: Record<string, string>;
}

interface CatoRedactedMessage {
  role: string;
  content: string;
  additional_contents?: string[];
}

interface CatoRedactedChat {
  all_redacted_messages: CatoRedactedMessage[];
  redacted_new_message: CatoRedactedMessage;
}

interface CatoRequiredAction {
  action_type?: 'anonymize_action' | 'block_action' | 'monitor_action';
  chat_redaction_result?: CatoRedactedChat;
  detection_message?: string;
  policy_ids?: string[];
}

interface CatoAnalyzeResponse {
  analysis_result?: Record<string, unknown>;
  invocation_id?: string;
  redacted_chat?: CatoRedactedChat;
  required_action?: CatoRequiredAction;
}

const textContent = (text: string): CatoContent => ({ type: 'text', text });

const stringifyArgs = (input: unknown): string => {
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input ?? {});
  } catch {
    return '';
  }
};

const normalizeRole = (role: unknown): CatoRole => {
  const r = typeof role === 'string' ? role.toLowerCase() : 'user';
  if (r === 'system' || r === 'assistant' || r === 'tool' || r === 'user') {
    return r;
  }
  if (r === 'model') return 'assistant';
  return 'user';
};

type CatoSource =
  | { kind: 'oai-msg'; idx: number }
  | { kind: 'ant-system' }
  | { kind: 'ant-main'; idx: number }
  | { kind: 'ant-tool-result'; idx: number; blockIdx: number }
  | { kind: 'complete'; idx: number | null }
  | { kind: 'embed'; idx: number | null }
  | { kind: 'response' };

interface BuiltMessages {
  messages: CatoOpenAIMessage[];
  sources: CatoSource[];
}

const openAIMessageToCato = (m: any, idx: number): BuiltMessages => {
  const msg: CatoOpenAIMessage = { role: normalizeRole(m?.role) };

  const rawContent = m?.content;
  if (typeof rawContent === 'string' && rawContent.length > 0) {
    msg.content = [textContent(rawContent)];
  } else if (Array.isArray(rawContent)) {
    const parts: CatoContent[] = [];
    for (const part of rawContent) {
      if (typeof part === 'string') {
        parts.push(textContent(part));
      } else if (part && typeof part === 'object') {
        const text =
          typeof part.text === 'string'
            ? part.text
            : typeof part.content === 'string'
              ? part.content
              : '';
        if (text) {
          parts.push({ type: part.type || 'text', text });
        }
      }
    }
    if (parts.length) msg.content = parts;
  }

  if (Array.isArray(m?.tool_calls) && m.tool_calls.length) {
    msg.tool_calls = m.tool_calls.map((tc: any) => ({
      id: tc?.id,
      type: tc?.type || 'function',
      function: tc?.function
        ? {
            name: tc.function.name,
            arguments: stringifyArgs(tc.function.arguments),
          }
        : undefined,
    }));
  }

  if (typeof m?.tool_call_id === 'string') {
    msg.tool_call_id = m.tool_call_id;
  }

  return { messages: [msg], sources: [{ kind: 'oai-msg', idx }] };
};

const anthropicMessageToCato = (m: any, idx: number): BuiltMessages => {
  const role = normalizeRole(m?.role);
  const rawContent = m?.content;

  if (typeof rawContent === 'string') {
    return {
      messages: [{ role, content: [textContent(rawContent)] }],
      sources: [{ kind: 'ant-main', idx }],
    };
  }

  if (!Array.isArray(rawContent)) {
    return {
      messages: [{ role }],
      sources: [{ kind: 'ant-main', idx }],
    };
  }

  const textParts: CatoContent[] = [];
  const toolCalls: CatoToolCall[] = [];
  const toolResultMessages: CatoOpenAIMessage[] = [];
  const toolResultSources: CatoSource[] = [];

  rawContent.forEach((block: any, blockIdx: number) => {
    if (!block || typeof block !== 'object') return;
    const type = block.type;
    if (type === 'text' && typeof block.text === 'string') {
      textParts.push(textContent(block.text));
    } else if (type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: stringifyArgs(block.input),
        },
      });
    } else if (type === 'tool_result') {
      const content =
        typeof block.content === 'string'
          ? block.content
          : Array.isArray(block.content)
            ? block.content
                .map((c: any) =>
                  typeof c === 'string' ? c : c?.text || c?.content || ''
                )
                .filter(Boolean)
                .join('\n')
            : '';
      toolResultMessages.push({
        role: 'tool',
        tool_call_id: block.tool_use_id,
        content: content ? [textContent(content)] : undefined,
      });
      toolResultSources.push({ kind: 'ant-tool-result', idx, blockIdx });
    }
  });

  const main: CatoOpenAIMessage = { role };
  if (textParts.length) main.content = textParts;
  if (toolCalls.length) main.tool_calls = toolCalls;

  const hasMain = !!(main.content || main.tool_calls);
  if (hasMain) {
    return {
      messages: [main, ...toolResultMessages],
      sources: [{ kind: 'ant-main', idx }, ...toolResultSources],
    };
  }
  return { messages: toolResultMessages, sources: toolResultSources };
};

const buildRequestMessages = (context: PluginContext): BuiltMessages => {
  const json = context.request?.json || {};
  const requestType = context.requestType;
  const messages: CatoOpenAIMessage[] = [];
  const sources: CatoSource[] = [];

  const pushBuilt = (b: BuiltMessages) => {
    messages.push(...b.messages);
    sources.push(...b.sources);
  };

  if (requestType === 'messages') {
    if (typeof json.system === 'string' && json.system) {
      messages.push({ role: 'system', content: [textContent(json.system)] });
      sources.push({ kind: 'ant-system' });
    } else if (Array.isArray(json.system)) {
      const text = json.system
        .map((s: any) => (typeof s === 'string' ? s : s?.text || ''))
        .filter(Boolean)
        .join('\n');
      if (text) {
        messages.push({ role: 'system', content: [textContent(text)] });
        sources.push({ kind: 'ant-system' });
      }
    }
    (json.messages || []).forEach((m: any, idx: number) =>
      pushBuilt(anthropicMessageToCato(m, idx))
    );
    return { messages, sources };
  }

  if (requestType === 'chatComplete' && Array.isArray(json.messages)) {
    json.messages.forEach((m: any, idx: number) =>
      pushBuilt(openAIMessageToCato(m, idx))
    );
    return { messages, sources };
  }

  if (requestType === 'complete') {
    const isArr = Array.isArray(json.prompt);
    const prompts = isArr
      ? json.prompt
      : json.prompt != null
        ? [json.prompt]
        : [];
    prompts.forEach((p: any, idx: number) => {
      if (typeof p === 'string' && p.length) {
        messages.push({ role: 'user', content: [textContent(p)] });
        sources.push({ kind: 'complete', idx: isArr ? idx : null });
      }
    });
    return { messages, sources };
  }

  if (requestType === 'embed') {
    const isArr = Array.isArray(json.input);
    const inputs = isArr ? json.input : json.input != null ? [json.input] : [];
    inputs.forEach((i: any, idx: number) => {
      if (typeof i === 'string' && i.length) {
        messages.push({ role: 'user', content: [textContent(i)] });
        sources.push({ kind: 'embed', idx: isArr ? idx : null });
      }
    });
    return { messages, sources };
  }

  return { messages, sources };
};

const buildTools = (
  context: PluginContext
): Record<string, any>[] | undefined => {
  const json = context.request?.json || {};
  if (Array.isArray(json.tools) && json.tools.length) {
    return json.tools;
  }
  return undefined;
};

const responseToCatoMessage = (
  context: PluginContext
): CatoOpenAIMessage | null => {
  const json = context.response?.json;
  if (!json) return null;
  const requestType = context.requestType;

  if (requestType === 'chatComplete') {
    const choice = Array.isArray(json.choices) ? json.choices[0] : null;
    const message = choice?.message;
    if (!message) return null;
    return openAIMessageToCato(message, -1).messages[0];
  }

  if (requestType === 'messages') {
    return anthropicMessageToCato(
      { role: json.role || 'assistant', content: json.content },
      -1
    ).messages[0];
  }

  if (requestType === 'complete') {
    const choice = Array.isArray(json.choices) ? json.choices[0] : null;
    const text = choice?.text;
    if (typeof text !== 'string' || !text) return null;
    return { role: 'assistant', content: [textContent(text)] };
  }

  return null;
};

const markContextMessages = (
  messages: CatoOpenAIMessage[],
  newMessageIndex: number
): CatoOpenAIMessage[] =>
  messages.map((m, idx) =>
    idx === newMessageIndex ? m : { ...m, is_context: true }
  );

const rewriteTextOnMessage = (msg: any, text: string): any => {
  const updated = { ...msg };
  if (Array.isArray(updated.content)) {
    const newContent = [...updated.content];
    const firstTextIdx = newContent.findIndex(
      (c: any) => typeof c?.text === 'string'
    );
    if (firstTextIdx >= 0) {
      newContent[firstTextIdx] = {
        ...newContent[firstTextIdx],
        text,
      };
    } else {
      newContent.unshift({ type: 'text', text });
    }
    updated.content = newContent;
  } else {
    updated.content = text;
  }
  return updated;
};

const rewriteToolResultBlock = (
  msg: any,
  blockIdx: number,
  text: string
): any => {
  if (!msg || !Array.isArray(msg.content)) return msg;
  const updated = { ...msg, content: [...msg.content] };
  const block = updated.content[blockIdx];
  if (!block || block.type !== 'tool_result') return msg;
  updated.content[blockIdx] = { ...block, content: text };
  return updated;
};

const applyRedactionToRequest = (
  json: any,
  requestType: string | undefined,
  sources: CatoSource[],
  redactedMessages: Array<{ content?: string } | null | undefined>
): any => {
  const updated: any = { ...json };
  if (Array.isArray(updated.messages)) {
    updated.messages = [...updated.messages];
  }
  if (Array.isArray(updated.prompt)) {
    updated.prompt = [...updated.prompt];
  }
  if (Array.isArray(updated.input)) {
    updated.input = [...updated.input];
  }

  const limit = Math.min(sources.length, redactedMessages.length);
  for (let i = 0; i < limit; i++) {
    const src = sources[i];
    const text = redactedMessages[i]?.content;
    if (typeof text !== 'string') continue;

    if (src.kind === 'oai-msg' || src.kind === 'ant-main') {
      if (!Array.isArray(updated.messages)) continue;
      updated.messages[src.idx] = rewriteTextOnMessage(
        updated.messages[src.idx],
        text
      );
    } else if (src.kind === 'ant-tool-result') {
      if (!Array.isArray(updated.messages)) continue;
      updated.messages[src.idx] = rewriteToolResultBlock(
        updated.messages[src.idx],
        src.blockIdx,
        text
      );
    } else if (src.kind === 'ant-system') {
      if (Array.isArray(updated.system)) {
        const firstText = updated.system.findIndex(
          (s: any) => typeof s === 'string' || typeof s?.text === 'string'
        );
        if (firstText >= 0) {
          const item = updated.system[firstText];
          updated.system = [...updated.system];
          updated.system[firstText] =
            typeof item === 'string' ? text : { ...item, text };
        } else {
          updated.system = text;
        }
      } else {
        updated.system = text;
      }
    } else if (src.kind === 'complete') {
      if (src.idx === null) {
        updated.prompt = text;
      } else if (Array.isArray(updated.prompt)) {
        updated.prompt[src.idx] = text;
      }
    } else if (src.kind === 'embed') {
      if (src.idx === null) {
        updated.input = text;
      } else if (Array.isArray(updated.input)) {
        updated.input[src.idx] = text;
      }
    }
  }

  return updated;
};

const applyRedactionToResponse = (
  json: any,
  requestType: string | undefined,
  redactedText: string
): any => {
  const updated = { ...json };

  if (requestType === 'chatComplete' && Array.isArray(updated.choices)) {
    updated.choices = [...updated.choices];
    const first = { ...updated.choices[0] };
    first.message = { ...first.message, content: redactedText };
    updated.choices[0] = first;
    return updated;
  }

  if (requestType === 'complete' && Array.isArray(updated.choices)) {
    updated.choices = [...updated.choices];
    const last = updated.choices.length - 1;
    updated.choices[last] = { ...updated.choices[last], text: redactedText };
    return updated;
  }

  if (requestType === 'messages' && Array.isArray(updated.content)) {
    const newContent = [...updated.content];
    const firstTextIdx = newContent.findIndex(
      (c: any) => typeof c?.text === 'string'
    );
    if (firstTextIdx >= 0) {
      newContent[firstTextIdx] = {
        ...newContent[firstTextIdx],
        text: redactedText,
      };
    } else {
      newContent.unshift({ type: 'text', text: redactedText });
    }
    updated.content = newContent;
    return updated;
  }

  return updated;
};

export const callCatoAnalyze = async (
  apiBase: string,
  apiKey: string,
  body: CatoAnalyzeRequest,
  extraHeaders: Record<string, string>,
  timeout?: number
): Promise<CatoAnalyzeResponse> => {
  const url = `${apiBase.replace(/\/$/, '')}${CATO_ANALYZE_PATH}`;
  const options = {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'x-cato-portkey-version': CATO_HOOK_VERSION,
      ...extraHeaders,
    },
  };
  return post<CatoAnalyzeResponse>(url, body, options, timeout);
};

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error: any = null;
  let verdict = true;
  let data: any = null;
  const transformedData: Record<string, any> = {
    request: { json: null },
    response: { json: null },
  };
  let transformed = false;

  const credentials = parameters.credentials as CatoCredentials | undefined;
  const apiKey = credentials?.apiKey;

  if (!apiKey) {
    return {
      error: {
        message:
          'Cato API key is required but not configured in plugin credentials.',
      },
      verdict: true,
      data: null,
      transformedData,
      transformed,
    };
  }

  const apiBase = credentials?.apiBase || CATO_DEFAULT_BASE_URL;

  const callId =
    context?.request?.headers?.['x-portkey-trace-id'] ||
    context?.metadata?.traceId ||
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const headers: Record<string, string> = {
    'x-cato-call-id': String(callId),
  };
  if (parameters.userEmail) {
    headers['x-cato-user-email'] = String(parameters.userEmail);
  }
  if (parameters.keyAlias) {
    headers['x-cato-gateway-key-alias'] = String(parameters.keyAlias);
  }
  if (context?.metadata?.sessionId) {
    headers['x-cato-session-id'] = String(context.metadata.sessionId);
  }

  try {
    const built = buildRequestMessages(context);
    let messages = built.messages;
    const sources = built.sources;

    if (eventType === 'afterRequestHook') {
      const assistantMessage = responseToCatoMessage(context);
      if (assistantMessage) {
        messages = [...messages, assistantMessage];
        sources.push({ kind: 'response' });
      }
    }

    if (messages.length === 0) {
      return {
        error: null,
        verdict: true,
        data: null,
        transformedData,
        transformed,
      };
    }

    messages = markContextMessages(messages, messages.length - 1);

    const body: CatoAnalyzeRequest = { messages };

    const tools = buildTools(context);
    if (tools) body.tools = tools;

    if (parameters.shouldAnonymizeMonitorAction !== undefined) {
      body.should_anonymize_monitor_action = Boolean(
        parameters.shouldAnonymizeMonitorAction
      );
    }

    const result = await callCatoAnalyze(
      apiBase,
      apiKey,
      body,
      headers,
      parameters.timeout
    );

    data = result;

    const actionType = result?.required_action?.action_type || 'monitor_action';

    if (actionType === 'block_action') {
      verdict = false;
    } else if (actionType === 'anonymize_action') {
      const chat =
        result?.required_action?.chat_redaction_result || result?.redacted_chat;
      const allRedacted = Array.isArray(chat?.all_redacted_messages)
        ? chat!.all_redacted_messages
        : null;
      const redactedNewText =
        typeof chat?.redacted_new_message?.content === 'string'
          ? chat!.redacted_new_message.content
          : null;

      if (eventType === 'beforeRequestHook') {
        if (allRedacted && allRedacted.length) {
          transformedData.request.json = applyRedactionToRequest(
            context.request?.json || {},
            context.requestType,
            sources,
            allRedacted
          );
          transformed = true;
        } else if (redactedNewText) {
          const fallbackSources = sources.length
            ? [sources[sources.length - 1]]
            : [];
          const fallbackRedacted = [{ content: redactedNewText }];
          transformedData.request.json = applyRedactionToRequest(
            context.request?.json || {},
            context.requestType,
            fallbackSources,
            fallbackRedacted
          );
          transformed = true;
        }
      } else if (redactedNewText) {
        transformedData.response.json = applyRedactionToResponse(
          context.response?.json || {},
          context.requestType,
          redactedNewText
        );
        transformed = true;
      }
      verdict = true;
    } else {
      verdict = true;
    }
  } catch (e: any) {
    if (e instanceof HttpError) {
      error = {
        message: e.response?.body || e.message,
        status: e.response?.status,
      };
    } else {
      if (e && typeof e === 'object') {
        delete e.stack;
      }
      error = e;
    }
    verdict = true;
    data = null;
  }

  return { error, verdict, data, transformedData, transformed };
};
