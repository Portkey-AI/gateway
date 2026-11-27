/**
 * Grant approval guardrail for Portkey AI Gateway.
 *
 * Upstream path: plugins/grant/index.ts
 * Zero dependencies: global fetch + AbortController only.
 * Zero custody: Grant receives tool names, call IDs, argument key names, and a
 * non-cryptographic correlation hash. Never argument values or credentials.
 */

import type {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginHandlerResponse,
  PluginParameters,
} from '../types';

const DEFAULT_GRANT_BASE_URL = 'https://grant-approve.vercel.app';
const DEFAULT_PROTECTED_TOOLS: string[] = [
  'send_email',
  'send_message',
  'issue_refund',
  'create_charge',
  'transfer_funds',
  'publish_content',
  'write_record',
  'delete_record',
  'execute_payment',
];

type ToolCall = {
  id?: string;
  name?: string;
  function?: { name?: string; arguments?: unknown };
  arguments?: unknown;
};

type ApprovalBody = {
  agent_name: string;
  tool_name: string;
  summary: string;
  scope: Record<string, unknown>;
  workspace: string;
  channel: string;
};

type GrantData = {
  approval_url: string;
  request_id: string;
  signed_receipt: string;
  status: string;
  checkpoint_required: boolean;
  grant_base_url: string;
};

function envValue(name: string): string {
  return typeof process !== 'undefined' && process.env ? String(process.env[name] || '') : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function bodyFor(context: PluginContext, eventType: HookEventType): unknown {
  const request = asRecord(context.request);
  const response = asRecord(context.response);
  if (eventType === 'afterRequestHook') {
    return response?.json ?? response?.body ?? response ?? request?.json ?? request?.body ?? request;
  }
  return request?.json ?? request?.body ?? request;
}

function collectToolCalls(value: unknown, depth = 0, found: ToolCall[] = []): ToolCall[] {
  if (depth > 6 || value === null || typeof value !== 'object') return found;
  if (Array.isArray(value)) {
    for (const item of value) collectToolCalls(item, depth + 1, found);
    return found;
  }
  const record = asRecord(value);
  if (!record) return found;
  const fn = asRecord(record.function);
  const isToolCall =
    (typeof fn?.name === 'string' && fn.name.length > 0) ||
    (typeof record.name === 'string' && 'arguments' in record);
  if (isToolCall) {
    found.push(record as ToolCall);
    return found;
  }
  for (const key of ['choices', 'output', 'tool_calls', 'messages', 'tools', 'message', 'delta']) {
    if (key in record) collectToolCalls(record[key], depth + 1, found);
  }
  return found;
}

function toolInfo(call: ToolCall): { name: string; args: unknown; id: string } {
  const fn = asRecord(call.function);
  const name = String(fn?.name ?? call.name ?? '').slice(0, 120);
  const rawArgs = fn?.arguments ?? call.arguments ?? {};
  let args: unknown = rawArgs;
  if (typeof rawArgs === 'string') {
    try {
      args = JSON.parse(rawArgs);
    } catch {
      args = { unparsed: true };
    }
  }
  return { name, args, id: String(call.id ?? '').slice(0, 120) };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = asRecord(value);
  if (!record) return JSON.stringify(value ?? null);
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

function correlationHash(value: unknown): string {
  const text = canonical(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function isProtected(name: string, protectedTools: string[]): boolean {
  if (protectedTools.includes('*')) return true;
  const needle = name.trim().toLowerCase();
  return protectedTools.some((tool) => tool.trim().toLowerCase() === needle);
}

function emptyData(baseUrl: string): GrantData {
  return {
    approval_url: '',
    request_id: '',
    signed_receipt: '',
    status: '',
    checkpoint_required: false,
    grant_base_url: baseUrl,
  };
}

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
): Promise<PluginHandlerResponse> => {
  const configuredUrl = String(parameters.grantBaseUrl || envValue('GRANT_BASE_URL') || DEFAULT_GRANT_BASE_URL);
  const baseUrl = configuredUrl.replace(/\/+$/, '');
  const protectedTools: string[] = Array.isArray(parameters.protectedTools)
    ? parameters.protectedTools.map(String)
    : DEFAULT_PROTECTED_TOOLS;
  const agentName = String(parameters.agentName || 'portkey-gateway').slice(0, 120);
  const workspace = String(parameters.workspace || 'public').slice(0, 60);
  const timeoutMs = Math.max(250, Math.min(30_000, Number(parameters.timeoutMs) || 2000));
  const apiKey = String(parameters.credentials?.grantApiKey || envValue('GRANT_API_KEY') || '');

  try {
    const url = new URL(`${baseUrl}/v1/approvals`);
    if (url.protocol !== 'https:' && !baseUrl.startsWith('http://localhost')) {
      throw new Error('Grant base URL must use HTTPS');
    }

    const calls = collectToolCalls(bodyFor(context, eventType)).filter((call) => {
      const { name } = toolInfo(call);
      return name.length > 0 && isProtected(name, protectedTools);
    });

    if (calls.length === 0) {
      return { error: null, verdict: true, data: emptyData(baseUrl), transformed: false };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    for (const call of calls) {
      const { name, args, id } = toolInfo(call);
      const argumentKeys = Object.keys(asRecord(args) ?? {}).sort().slice(0, 50);
      const body: ApprovalBody = {
        agent_name: agentName,
        tool_name: name,
        summary: `Allow the assistant to call ${name}?`,
        scope: {
          tool_call_id: id,
          argument_keys: argumentKeys,
          arguments_sha256: correlationHash(args),
        },
        workspace,
        channel: 'portkey_plugin',
      };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response: globalThis.Response;
      try {
        response = await fetch(url.toString(), {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      const payload = asRecord(await response.json()) ?? {};
      const status = String(payload.status ?? '');
      const decisionType = String(payload.decision_type ?? '');
      const approved =
        status.toLowerCase() === 'approved' ||
        ['continue_once', 'always_allow', 'approve', 'always', 'auto_rule'].includes(decisionType.toLowerCase());
      const data: GrantData = {
        approval_url: String(payload.approval_url ?? ''),
        request_id: String(payload.request_id ?? payload.id ?? ''),
        signed_receipt: String(payload.signed_receipt ?? ''),
        status,
        checkpoint_required: !approved,
        grant_base_url: baseUrl,
      };
      if (response.status >= 400 || !approved) {
        return { error: null, verdict: false, data, transformed: false };
      }
    }

    return { error: null, verdict: true, data: emptyData(baseUrl), transformed: false };
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    return {
      error: normalized,
      verdict: false,
      data: { ...emptyData(baseUrl), status: 'error', checkpoint_required: false },
      transformed: false,
    };
  }
};

export default handler;
