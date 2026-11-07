/**
 * @file src/mcp/services/obsidianPolicy.ts
 * Client for the Obsidian Security Realtime Enforcement "Unified Evaluation"
 * API. The gateway asks Obsidian for a verdict on each MCP tool call before it
 * runs (PreToolUse) and on the tool's result before it is returned to the
 * client (PostToolUse).
 *
 * Design notes:
 * - Framework-free: plain functions plus an injectable `fetch`, so the same
 *   module can later back a webhook adapter for the commercial gateway.
 * - `evaluateToolEvent` never throws. Every failure is turned into a
 *   PolicyDecision according to the server's fail mode (closed by default).
 * - Secrets (the gateway token) are never logged or placed in payloads.
 *
 * API reference: the Unified Evaluation page of Obsidian's documentation
 * (https://docs.obsidiansecurity.com/, Obsidian portal login required).
 * Early Access, US region.
 */

import { createLogger } from '../../shared/utils/logger';
import { getValueOrFileContents } from '../../utils/env';
import { recordPolicyEvaluation } from '../utils/policyMetrics';

const logger = createLogger('mcp/obsidianPolicy');

// ============================================================================
// Types
// ============================================================================

export type ObsidianStage = 'PreToolUse' | 'PostToolUse';
export type ObsidianFailMode = 'closed' | 'open';

/** Gateway-wide connection settings (from environment). */
export interface ObsidianEnvConfig {
  /** Full evaluation endpoint URL. */
  endpoint: string;
  /** Bearer token the gateway sends on every evaluation call. */
  gatewayToken: string;
  /** Stable name for this gateway; policies are `app: "unified"`. */
  clientPlatform: string;
  /** Per-call timeout in milliseconds. */
  timeoutMs: number;
  /**
   * Registered runtime extension to attach to every event. Optional: Obsidian
   * rejects an unregistered namespace/version, so only set it once registered.
   */
  runtimeExtension?: { namespace: string; version: string };
  /**
   * Send extra context (client name/version, token scopes/roles/groups, tool
   * annotations) as `agent.name` and extra `runtime_extension.data` keys.
   * Opt-in via OBSIDIAN_EXTENDED_CONTEXT=true, because Obsidian rejects
   * runtime extension data that does not match the registered schema.
   */
  extendedContext: boolean;
}

/** Per-server settings (`policy.obsidian` in servers.json). */
export interface ObsidianServerPolicy {
  enabled?: boolean;
  /** What to do when Obsidian cannot give a verdict. Default: closed. */
  failMode?: ObsidianFailMode;
  /** Which stages to evaluate. Default: both. */
  stages?: ObsidianStage[];
  /** Overrides the gateway-wide timeout for this server. */
  timeoutMs?: number;
}

export interface RuntimeExtension {
  namespace: string;
  /** Registered version, as a string (e.g. "1"). */
  version: string;
  data: Record<string, unknown>;
}

export interface ToolEventInput {
  stage: ObsidianStage;
  /** MCP server id; sent as `target_service`. */
  serverId: string;
  toolName: string;
  args?: unknown;
  /** Required for PostToolUse. */
  toolResponse?: unknown;
  sessionId: string;
  user?: { id?: string; email?: string };
  agent?: { id?: string; name?: string };
  /** Explicit runtime extension; takes precedence over the configured one. */
  runtimeExtension?: RuntimeExtension;
  /**
   * `runtime_extension.data` to send with the extension configured through
   * OBSIDIAN_RUNTIME_EXTENSION_*. Ignored if that is not configured.
   */
  runtimeData?: Record<string, unknown>;
  /** Test seams; generated when omitted. */
  eventId?: string;
  timestamp?: string;
}

export interface MatchedPolicy {
  id?: string;
  name?: string;
  action?: string;
}

export type DecisionKind =
  /** Obsidian evaluated the event and no policy blocked it. */
  | 'pass'
  | 'warn'
  /** A policy blocked the event. */
  | 'block'
  /** Obsidian did not evaluate the event (no evaluation_id). */
  | 'not_evaluated'
  /** The call failed (timeout, network, HTTP error, bad response). */
  | 'error';

export interface PolicyDecision {
  /** True if the gateway should let the action proceed. */
  allowed: boolean;
  kind: DecisionKind;
  /** Obsidian's message for the deciding policy, or a failure description. */
  message?: string;
  /** The event's id in Obsidian's event log; absent if not evaluated. */
  evaluationId?: string;
  matchedPolicies: MatchedPolicy[];
  /** True when `allowed` came from the fail mode, not from a verdict. */
  viaFailMode: boolean;
}

export interface EvaluateDeps {
  fetch?: typeof fetch;
}

// ============================================================================
// Configuration
// ============================================================================

export const DEFAULT_OBSIDIAN_ENDPOINT =
  'https://agent-guard.obsec.io/webhook/unified/v1/enforcement';
export const DEFAULT_CLIENT_PLATFORM = 'portkey_oss_gateway';
export const DEFAULT_TIMEOUT_MS = 2500;
/** Retries apply only to network errors and 5xx, never to timeouts or 4xx. */
const MAX_RETRIES = 1;

/** Names Obsidian reserves for its built-in integrations. */
const RESERVED_PLATFORMS = new Set([
  'claudecode',
  'codex',
  'copilot',
  'copilot_studio',
  'cursor',
  'mcpguard',
  'mcp_gateway',
  'n8n',
]);

const PLATFORM_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Validate a `client_platform` value. Obsidian compares names ignoring case
 * and reads "-" as "_", so a reserved name in disguise is rejected too.
 * Returns an error message, or null if valid.
 */
export function validateClientPlatform(name: string): string | null {
  if (!PLATFORM_PATTERN.test(name)) {
    return 'client_platform must be 1-64 letters, digits, ".", "_" or "-"';
  }
  const normalized = name.toLowerCase().replace(/-/g, '_');
  if (RESERVED_PLATFORMS.has(normalized)) {
    return `client_platform "${name}" is reserved by Obsidian`;
  }
  return null;
}

/**
 * Read gateway-wide settings from the environment. Returns null when
 * OBSIDIAN_GATEWAY_TOKEN is unset (Obsidian integration not configured).
 * Throws a descriptive error on an invalid setting (reserved client platform,
 * bad timeout, half-set runtime extension). Callers load this lazily, on the
 * first policy check, so the gateway reports it as a fail-mode decision on
 * each check (see getObsidianEnvConfig) rather than refusing to start.
 */
export function loadObsidianEnvConfig(
  env: Record<string, string | undefined> = process.env
): ObsidianEnvConfig | null {
  // Accepts the token itself or an absolute path to a file holding it
  // (Docker/Kubernetes secrets), like the gateway's other secrets.
  const gatewayToken = getValueOrFileContents(
    env.OBSIDIAN_GATEWAY_TOKEN?.trim()
  )?.trim();
  if (!gatewayToken) return null;

  const clientPlatform =
    env.OBSIDIAN_CLIENT_PLATFORM?.trim() || DEFAULT_CLIENT_PLATFORM;
  const platformError = validateClientPlatform(clientPlatform);
  if (platformError)
    throw new Error(`OBSIDIAN_CLIENT_PLATFORM: ${platformError}`);

  let timeoutMs = DEFAULT_TIMEOUT_MS;
  if (env.OBSIDIAN_TIMEOUT_MS) {
    timeoutMs = Number(env.OBSIDIAN_TIMEOUT_MS);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) {
      throw new Error(
        'OBSIDIAN_TIMEOUT_MS must be an integer from 100 to 30000'
      );
    }
  }

  const extNamespace = env.OBSIDIAN_RUNTIME_EXTENSION_NAMESPACE?.trim();
  const extVersion = env.OBSIDIAN_RUNTIME_EXTENSION_VERSION?.trim();
  if (!!extNamespace !== !!extVersion) {
    throw new Error(
      'OBSIDIAN_RUNTIME_EXTENSION_NAMESPACE and OBSIDIAN_RUNTIME_EXTENSION_VERSION must be set together'
    );
  }
  if (extNamespace?.startsWith('obsidian.')) {
    throw new Error(
      'OBSIDIAN_RUNTIME_EXTENSION_NAMESPACE: the "obsidian." prefix is reserved'
    );
  }

  return {
    endpoint: env.OBSIDIAN_ENDPOINT?.trim() || DEFAULT_OBSIDIAN_ENDPOINT,
    gatewayToken,
    clientPlatform,
    timeoutMs,
    extendedContext:
      env.OBSIDIAN_EXTENDED_CONTEXT?.trim().toLowerCase() === 'true',
    ...(extNamespace && extVersion
      ? { runtimeExtension: { namespace: extNamespace, version: extVersion } }
      : {}),
  };
}

let cachedEnvConfig: ObsidianEnvConfig | null | undefined;

/**
 * Process-wide config from the real environment, loaded once. A successful
 * load (including "not configured" = null) is cached; an invalid config throws
 * on every call so the problem is not silently remembered as "off".
 */
export function getObsidianEnvConfig(): ObsidianEnvConfig | null {
  if (cachedEnvConfig === undefined) {
    cachedEnvConfig = loadObsidianEnvConfig(process.env);
  }
  return cachedEnvConfig;
}

/** Test seam: forget the cached environment config. */
export function resetObsidianEnvConfigCache(): void {
  cachedEnvConfig = undefined;
}

/** Whether the given stage should be evaluated for this server. */
export function isStageEnabled(
  policy: ObsidianServerPolicy | undefined,
  stage: ObsidianStage
): boolean {
  if (!policy?.enabled) return false;
  const stages = policy.stages ?? ['PreToolUse', 'PostToolUse'];
  return stages.includes(stage);
}

// ============================================================================
// Request construction
// ============================================================================

/** Build the Unified Evaluation request body. */
export function buildEvent(
  input: ToolEventInput,
  config: Pick<ObsidianEnvConfig, 'clientPlatform'>
): Record<string, unknown> {
  const actionParam: Record<string, unknown> = {
    tool_name: input.toolName,
    args: input.args ?? {},
  };

  if (input.stage === 'PostToolUse') {
    // Obsidian answers 400 if tool_response is missing or an empty string.
    const response = input.toolResponse;
    actionParam.tool_response =
      response === undefined || response === null || response === ''
        ? {}
        : response;
  }

  const event: Record<string, unknown> = {
    version: '1.0',
    event_id: input.eventId ?? crypto.randomUUID(),
    timestamp: input.timestamp ?? new Date().toISOString(),
    client_platform: config.clientPlatform,
    stage: input.stage,
    session_id: input.sessionId,
    target_service: input.serverId,
    action_param: actionParam,
  };

  if (input.user && (input.user.id || input.user.email)) {
    event.user = { ...input.user };
  }
  if (input.agent && (input.agent.id || input.agent.name)) {
    event.agent = { ...input.agent };
  }
  if (input.runtimeExtension) {
    event.runtime_extension = input.runtimeExtension;
  }
  return event;
}

// ============================================================================
// Evaluation
// ============================================================================

export function failureDecision(
  failMode: ObsidianFailMode,
  kind: 'error' | 'not_evaluated',
  message: string,
  extras: Partial<PolicyDecision> = {}
): PolicyDecision {
  return {
    allowed: failMode === 'open',
    kind,
    message,
    matchedPolicies: [],
    viaFailMode: true,
    ...extras,
  };
}

/** Keep error text short and free of anything resembling a credential. */
function describeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.slice(0, 200);
}

/**
 * Pull a short, safe error code/message out of an Obsidian error body, such as
 * `unregistered_runtime_extension`, so operators can diagnose a 4xx. Returns
 * undefined if there is nothing usable. Never throws.
 */
async function readErrorDetail(
  response: Response
): Promise<string | undefined> {
  try {
    const body: any = await response.json();
    const parts = [body?.error, body?.code, body?.message].filter(
      (v): v is string => typeof v === 'string' && v.length > 0
    );
    const text = [...new Set(parts)].join(': ').slice(0, 160);
    return text || undefined;
  } catch {
    return undefined;
  }
}

async function postOnce(
  event: Record<string, unknown>,
  config: ObsidianEnvConfig,
  timeoutMs: number,
  doFetch: typeof fetch
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await doFetch(config.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.gatewayToken}`,
        'Content-Type': 'application/json',
        'User-Agent': `${config.clientPlatform}/1.0`,
      },
      body: JSON.stringify(event),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ask Obsidian for a verdict on one tool event. Never throws.
 *
 * Verdict rules (from the Obsidian docs):
 * - Read `decision`, not the HTTP status.
 * - `block`, or any value other than pass/warn, blocks the action.
 * - `pass`/`warn` let it run. Without an `evaluation_id` Obsidian did not
 *   evaluate the event, so the server's fail mode decides.
 * - Any failure to get an answer follows the fail mode.
 */
async function runEvaluation(
  input: ToolEventInput,
  config: ObsidianEnvConfig,
  policy: ObsidianServerPolicy = {},
  deps: EvaluateDeps = {}
): Promise<PolicyDecision> {
  const failMode: ObsidianFailMode = policy.failMode ?? 'closed';
  const timeoutMs = policy.timeoutMs ?? config.timeoutMs;
  const doFetch = deps.fetch ?? fetch;
  const event = buildEvent(
    !input.runtimeExtension && config.runtimeExtension
      ? {
          ...input,
          runtimeExtension: {
            ...config.runtimeExtension,
            data: input.runtimeData ?? {},
          },
        }
      : input,
    config
  );

  let response: Response | undefined;
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      response = await postOnce(event, config, timeoutMs, doFetch);
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        lastError = `Obsidian returned HTTP ${response.status}`;
        response = undefined;
        continue;
      }
      break;
    } catch (error) {
      // Check `name`, not `instanceof Error`: an abort surfaces as a
      // DOMException, which is not always an Error across runtimes/realms.
      const aborted =
        (error as { name?: string } | null)?.name === 'AbortError';
      lastError = aborted
        ? `Obsidian evaluation timed out after ${timeoutMs}ms`
        : `Obsidian request failed: ${describeError(error)}`;
      // Never retry a timeout: it would double the latency of a hot path.
      if (aborted || attempt >= MAX_RETRIES) break;
    }
  }

  if (!response) {
    return failureDecision(failMode, 'error', lastError ?? 'Unknown failure');
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    const message = `Obsidian returned HTTP ${response.status}${
      detail ? ` (${detail})` : ''
    }`;
    return failureDecision(failMode, 'error', message);
  }

  let body: any;
  try {
    body = await response.json();
  } catch {
    const message = 'Obsidian returned a response that is not valid JSON';
    return failureDecision(failMode, 'error', message);
  }

  const decision = typeof body?.decision === 'string' ? body.decision : '';
  const evaluationId =
    typeof body?.evaluation_id === 'string' && body.evaluation_id
      ? body.evaluation_id
      : undefined;
  const message = typeof body?.message === 'string' ? body.message : undefined;
  const matchedPolicies: MatchedPolicy[] = Array.isArray(body?.matched_policies)
    ? body.matched_policies
    : [];

  if (decision === 'pass' || decision === 'warn') {
    if (!evaluationId) {
      // Obsidian did not evaluate the event; `pass` here is not a verdict.
      const note = message ?? 'Obsidian did not evaluate the event';
      return failureDecision(failMode, 'not_evaluated', note, {
        matchedPolicies,
      });
    }
    return {
      allowed: true,
      kind: decision,
      message,
      evaluationId,
      matchedPolicies,
      viaFailMode: false,
    };
  }

  // `block`, or any unrecognised value: block, as the docs require. This
  // deliberately ignores the fail mode: Obsidian did answer.
  return {
    allowed: false,
    kind: 'block',
    message:
      message ??
      (decision === 'block'
        ? 'Blocked by policy'
        : `Unrecognised Obsidian decision "${decision}"`),
    evaluationId,
    matchedPolicies,
    viaFailMode: false,
  };
}

/**
 * Ask Obsidian for a verdict on one tool event, and record how long it took
 * and what happened. See `runEvaluation` for the verdict rules. Never throws.
 */
export async function evaluateToolEvent(
  input: ToolEventInput,
  config: ObsidianEnvConfig,
  policy: ObsidianServerPolicy = {},
  deps: EvaluateDeps = {}
): Promise<PolicyDecision> {
  const started = Date.now();
  const decision = await runEvaluation(input, config, policy, deps);
  const durationMs = Date.now() - started;
  recordPolicyEvaluation({
    server: input.serverId,
    stage: input.stage,
    decision: decision.kind,
    allowed: decision.allowed,
    viaFailMode: decision.viaFailMode,
    durationMs,
  });
  logPolicyDecision(input, decision, policy, durationMs);
  return decision;
}

/**
 * One structured line per evaluation, so a verdict can be seen locally and
 * matched to Obsidian's event log by evaluation_id. `pass` is logged at info;
 * anything else (warn, block, not evaluated, error) at warn.
 *
 * Deliberately NOT logged: tool arguments, tool results, and the token. The
 * reason is Obsidian's policy message or a short failure description.
 */
export function logPolicyDecision(
  input: ToolEventInput,
  decision: PolicyDecision,
  policy: ObsidianServerPolicy,
  durationMs: number
): void {
  try {
    const fields = [
      `stage=${input.stage}`,
      `server=${input.serverId}`,
      `tool=${input.toolName}`,
      `decision=${decision.kind}`,
      `allowed=${decision.allowed}`,
      `source=${decision.viaFailMode ? 'fail_mode' : 'verdict'}`,
      `evaluation_id=${decision.evaluationId ?? '-'}`,
      `duration_ms=${durationMs}`,
      `session=${input.sessionId.slice(0, 8)}`,
    ];
    if (decision.viaFailMode) {
      fields.push(`fail_mode=${policy.failMode ?? 'closed'}`);
    }
    if (decision.kind !== 'pass' && decision.message) {
      // JSON-quote so a message can't break the key=value format or inject lines.
      fields.push(`reason=${JSON.stringify(decision.message.slice(0, 200))}`);
    }
    const line = `Policy ${fields.join(' ')}`;
    if (decision.kind === 'pass') logger.info(line);
    else logger.warn(line);
  } catch {
    // Logging must never affect a tool call.
  }
}
