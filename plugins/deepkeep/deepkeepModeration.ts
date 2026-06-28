import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';

type DeepKeepVerbosityItem = {
  guardrail_name?: string;
  risk_level?: string;
  details?: {
    guardrail_action?: string;
    modified?: Array<{ role?: string; content?: string }>;
  };
};

const ACTION_PRIORITY: Record<string, number> = {
  block: 4,
  redact: 3,
  modify: 2,
  alert: 1,
};

function deepClone<T>(value: T): T {
  return value === null || value === undefined
    ? value
    : JSON.parse(JSON.stringify(value));
}

function getString(value: any): string {
  return typeof value === 'string' ? value : '';
}

function getBool(value: any, defaultValue: boolean): boolean {
  return typeof value === 'boolean' ? value : defaultValue;
}

function getNumber(value: any, defaultValue: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : defaultValue;
}

function getFirewallId(
  parameters: PluginParameters,
  eventType: HookEventType
): string {
  const perHook =
    eventType === 'beforeRequestHook'
      ? getString(parameters.inputFirewallId)
      : getString(parameters.outputFirewallId);

  return perHook || getString(parameters.firewallId);
}

function getTextToModerate(
  context: PluginContext,
  eventType: HookEventType
): string {
  return eventType === 'beforeRequestHook'
    ? getString(context.request?.text)
    : getString(context.response?.text);
}

function getEndpoint(
  parameters: PluginParameters,
  eventType: HookEventType
): string {
  const baseUrl = getString(parameters.apiBaseUrl).replace(/\/$/, '');
  return `${baseUrl}/api/v3/openai/moderations/${eventType === 'beforeRequestHook' ? 'pre' : 'post'}`;
}

function getHeaders(context: PluginContext): Record<string, string> {
  const credentials = context.credentials || {};
  if (getString(credentials.bearerToken)) {
    return { Authorization: `Bearer ${credentials.bearerToken}` };
  }
  if (getString(credentials.apiKey)) {
    return { 'X-API-Key': credentials.apiKey };
  }
  return {};
}

function pickAction(resp: any): {
  action: string;
  item: DeepKeepVerbosityItem | null;
} {
  const verbosity: DeepKeepVerbosityItem[] = Array.isArray(resp?.verbosity)
    ? resp.verbosity
    : [];

  let bestAction = 'block';
  let bestScore = 0;
  let bestItem: DeepKeepVerbosityItem | null = null;

  for (const item of verbosity) {
    const action = String(
      item?.details?.guardrail_action || 'alert'
    ).toLowerCase();
    const score = ACTION_PRIORITY[action] || 1;
    if (score > bestScore) {
      bestScore = score;
      bestAction = action;
      bestItem = item;
    }
  }

  return { action: bestAction, item: bestItem };
}

function extractModifiedText(resp: any): string {
  const candidates = [
    resp?.modified_output,
    resp?.modified_input,
    resp?.content,
    resp?.text,
    resp?.output,
    resp?.input,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate) return candidate;
  }

  const verbosity: DeepKeepVerbosityItem[] = Array.isArray(resp?.verbosity)
    ? resp.verbosity
    : [];
  for (const item of verbosity) {
    const modified = item.details?.modified;
    if (Array.isArray(modified)) {
      for (const entry of modified) {
        if (typeof entry?.content === 'string' && entry.content)
          return entry.content;
      }
    }
  }

  return '';
}

function transformRequestJson(original: any, redactedText: string): any {
  const requestJson = deepClone(original) || {};
  if (Array.isArray(requestJson.messages)) {
    for (let i = requestJson.messages.length - 1; i >= 0; i -= 1) {
      const message = requestJson.messages[i];
      if (message && typeof message === 'object' && message.role !== 'system') {
        message.content = redactedText;
        return requestJson;
      }
    }
  }
  if (typeof requestJson.prompt === 'string') requestJson.prompt = redactedText;
  else if (typeof requestJson.input === 'string')
    requestJson.input = redactedText;
  else requestJson.text = redactedText;
  return requestJson;
}

function transformResponseJson(original: any, redactedText: string): any {
  const responseJson = deepClone(original) || {};
  if (Array.isArray(responseJson.choices)) {
    for (const choice of responseJson.choices) {
      if (choice?.message && typeof choice.message === 'object')
        choice.message.content = redactedText;
      if (typeof choice?.text === 'string') choice.text = redactedText;
    }
  } else if (typeof responseJson.text === 'string') {
    responseJson.text = redactedText;
  }
  return responseJson;
}

async function callDeepKeep(
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType,
  text: string
): Promise<any> {
  const endpoint = getEndpoint(parameters, eventType);
  const payloadKey = eventType === 'beforeRequestHook' ? 'input' : 'output';
  const body: Record<string, any> = {
    model: getFirewallId(parameters, eventType),
    [payloadKey]: text,
  };

  const chatId = getString(parameters.chatId);
  const title = getString(parameters.title);
  if (chatId) body.chat = chatId;
  if (title) body.title = title;

  const controller = new AbortController();
  const timeoutMs = getNumber(parameters.timeoutMs, 10000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getHeaders(context) },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const textBody = await response.text();
    const parsed = textBody ? JSON.parse(textBody) : null;
    if (!response.ok)
      throw new Error(`DeepKeep returned HTTP ${response.status}`);
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = true;
  let data: any = null;
  const transformedData: Record<string, any> = {
    request: { json: null, text: null },
    response: { json: null, text: null },
  };
  let transformed = false;

  try {
    const textToCheck = getTextToModerate(context, eventType);
    if (!textToCheck) {
      return {
        error: null,
        verdict: true,
        data: null,
        transformedData,
        transformed,
      };
    }

    const moderationResponse = await callDeepKeep(
      context,
      parameters,
      eventType,
      textToCheck
    );
    const failOpen = getBool(parameters.failOpen, true);
    const flagged = Boolean(moderationResponse?.flagged);
    const { action } = flagged
      ? pickAction(moderationResponse)
      : { action: 'alert' };
    const modifiedText = extractModifiedText(moderationResponse);

    data = {
      request_id: moderationResponse?.request_id,
      firewall_name: moderationResponse?.firewall_name,
      risk_level: moderationResponse?.risk_level,
      action,
      flagged,
      verbosity: moderationResponse?.verbosity || [],
      modified_text: modifiedText || null,
      eventType,
    };

    verdict = !(flagged && action === 'block');

    if (
      flagged &&
      (action === 'redact' || action === 'modify') &&
      modifiedText
    ) {
      if (eventType === 'beforeRequestHook') {
        transformedData.request.json = transformRequestJson(
          context.request?.json,
          modifiedText
        );
        transformedData.request.text = modifiedText;
      } else {
        transformedData.response.json = transformResponseJson(
          context.response?.json,
          modifiedText
        );
        transformedData.response.text = modifiedText;
      }
      transformed = true;
    }

    if (!moderationResponse) {
      verdict = failOpen;
    }
  } catch (e: any) {
    error = e;
    verdict = getBool(parameters.failOpen, true);
    data = { error: e?.message || String(e), failOpen: verdict };
  }

  return { error, verdict, data, transformedData, transformed };
};
