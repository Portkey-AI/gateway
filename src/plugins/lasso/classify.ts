import { Message, OpenAIMessageRole } from '../../types/requestBody';
import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginHandlerOptions,
  PluginParameters,
} from '../types';
import { getText, post } from '../utils';

export const LASSO_BASE_URL = 'https://server.lasso.security';

enum LassoMessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
  DEVELOPER = 'developer',
}

const ROLE_MAP: Record<OpenAIMessageRole, LassoMessageRole> = {
  user: LassoMessageRole.USER,
  assistant: LassoMessageRole.ASSISTANT,
  system: LassoMessageRole.SYSTEM,
  developer: LassoMessageRole.DEVELOPER,
  function: LassoMessageRole.USER,
  tool: LassoMessageRole.USER,
};

function toLassoRole(role: OpenAIMessageRole): LassoMessageRole {
  return ROLE_MAP[role] ?? LassoMessageRole.USER;
}

interface LassoMessage {
  role: LassoMessageRole;
  content: string;
}

interface LassoFinding {
  name: string;
  category: string;
  action: 'BLOCK' | 'AUTO_MASKING' | 'WARN';
  severity: string;
  score?: number;
}

enum LassoMessageType {
  PROMPT = 'PROMPT',
  COMPLETION = 'COMPLETION',
}

interface LassoV3ClassifyRequest {
  messages: LassoMessage[];
  messageType: LassoMessageType;
  sessionId?: string;
  userId?: string;
}

interface LassoV3ClassifyResponse {
  deputies: Record<string, boolean>;
  violations_detected: boolean;
  findings: Record<string, LassoFinding[]>;
}

function hasBlockAction(findings: Record<string, LassoFinding[]>): boolean {
  return Object.values(findings).some((deputyFindings) =>
    deputyFindings.some((finding) => finding.action === 'BLOCK')
  );
}

/**
 * Normalize a message's content to a plain string.
 * Handles OpenAI's array content format (e.g., [{type: "text", text: "..."}])
 * by extracting only text parts and concatenating them.
 */
function normalizeContent(content: any): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content.reduce(
      (value: string, item: any) =>
        value + (item.type === 'text' ? item.text || '' : ''),
      ''
    );
  }
  return '';
}

/**
 * Extract messages from the request body based on the requestType.
 * Handles chatComplete/messages, complete, embed, and createModelResponse.
 */
function extractRequestMessages(context: PluginContext): LassoMessage[] {
  const requestType = context.requestType;
  const json = context.request?.json;

  if (!json) return [];

  switch (requestType) {
    case 'chatComplete':
    case 'messages':
      return (json.messages || []).map((message: Message) => ({
        role: toLassoRole(message.role),
        content: normalizeContent(message.content),
      }));

    case 'complete': {
      const prompt = json.prompt;
      if (!prompt || (Array.isArray(prompt) && prompt.length === 0)) return [];
      const text = Array.isArray(prompt) ? prompt.join('\n') : String(prompt);
      if (!text) return [];
      return [{ role: LassoMessageRole.USER, content: text }];
    }

    case 'embed': {
      const input = json.input;
      if (!input || (Array.isArray(input) && input.length === 0)) return [];
      const text = Array.isArray(input) ? input.join('\n') : String(input);
      if (!text) return [];
      return [{ role: LassoMessageRole.USER, content: text }];
    }

    default:
      return [];
  }
}

export const classify = async (
  credentials: Record<string, any>,
  data: LassoV3ClassifyRequest,
  timeout?: number
) => {
  const options: {
    headers: Record<string, string>;
  } = {
    headers: {
      'lasso-api-key': `${credentials.apiKey}`,
    },
  };

  const baseURL = credentials.apiEndpoint || LASSO_BASE_URL;
  const url = `${baseURL}/gateway/v3/classify`;

  return post<LassoV3ClassifyResponse>(url, data, options, timeout);
};

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType,
  options: PluginHandlerOptions
) => {
  let error = null;
  let verdict = true; // Default to allowing the request
  let data = null;

  try {
    // Derive messageType from eventType
    const messageType =
      eventType === 'beforeRequestHook'
        ? LassoMessageType.PROMPT
        : LassoMessageType.COMPLETION;

    let messages: LassoMessage[];

    if (eventType === 'afterRequestHook') {
      const text = getText(context, eventType).trim();
      messages = text
        ? [{ role: LassoMessageRole.ASSISTANT, content: text }]
        : [];
    } else {
      messages = extractRequestMessages(context);
    }

    // Nothing to classify – skip the Lasso call
    if (messages.length === 0) {
      return { error: null, verdict: true, data: null };
    }

    // Prepare the v3 request payload
    const payload: LassoV3ClassifyRequest = {
      messages,
      messageType,
    };

    // Map conversationId to sessionId
    const conversationId = parameters.conversationId as string | undefined;
    if (conversationId) {
      payload.sessionId = conversationId;
    }

    // Map userId to request body
    const userId = parameters.userId as string | undefined;
    if (userId) {
      payload.userId = userId;
    }

    // Call the Lasso Security Deputies API v3
    const result = await classify(
      parameters.credentials || {},
      payload,
      parameters.timeout
    );

    // Block only when violations are detected AND at least one finding has BLOCK action
    // WARN and AUTO_MASKING violations pass through with data
    if (result.violations_detected && hasBlockAction(result.findings)) {
      verdict = false;
    }

    data = result;
  } catch (e: any) {
    console.error('Error calling Lasso Security API:', e);
    delete e.stack;
    error = e;
    verdict = false; // Block on error to be safe
  }

  return { error, verdict, data };
};
