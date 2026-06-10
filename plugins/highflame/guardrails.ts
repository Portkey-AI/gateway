import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getCurrentContentPart } from '../utils';

const DEFAULT_DOMAIN = 'api.highflame.ai';
const DEFAULT_TOKEN_URL = 'https://auth.highflame.ai/oauth2/token';
// Refresh the JWT this many ms before it actually expires.
const TOKEN_REFRESH_BUFFER_MS = 60_000;

interface HighflameCredentials {
  apiKey: string;
  domain?: string;
  application?: string;
  tokenUrl?: string;
}

interface HighflameSignal {
  vulnerability_id?: string;
  name?: string;
  severity?: string;
  score?: number;
  category?: string;
  context_key?: string;
}

interface HighflameGuardResponse {
  decision: string; // allow | deny | alert | modify | monitor | step_up | defer
  policy_reason?: string;
  signals?: HighflameSignal[];
  redacted_content?: string | null;
  request_id?: string;
}

// OWASP LLM Top 10 (2025) capability names → Shield detector IDs.
// Mirrors Highflame's published taxonomy (https://docs.highflame.ai).
const CAPABILITY_MAP: Record<string, string[]> = {
  prompt_injection: ['injection'], // LLM01
  sensitive_information_disclosure: ['pii', 'pii_model', 'dlp', 'secrets'], // LLM02
  excessive_agency: [
    'tool_risk',
    'mcp_risk',
    'tool_poisoning',
    'command_injection',
    'sql_injection',
    'path_traversal',
  ], // LLM06
  misinformation: ['hallucination'], // LLM09
  unbounded_consumption: ['budget_checker', 'loop_detector'], // LLM10
  content_safety: ['content_safety', 'toxicity'], // trust & safety
  language_detection: ['language'],
};

function resolveDetectors(capabilities?: string[]): string[] {
  if (!capabilities || capabilities.length === 0) return [];
  const out: string[] = [];
  for (const capability of capabilities) {
    for (const detector of CAPABILITY_MAP[capability] ?? []) {
      if (!out.includes(detector)) out.push(detector);
    }
  }
  return out;
}

// --- Token cache: service key -> bearer JWT, shared across invocations. ---
interface CachedToken {
  token: string;
  expiresAt: number;
}
const tokenCache = new Map<string, CachedToken>();
const tokenInflight = new Map<string, Promise<string>>();

async function getToken(apiKey: string, tokenUrl: string): Promise<string> {
  const cached = tokenCache.get(apiKey);
  if (cached && Date.now() < cached.expiresAt) return cached.token;

  const inflight = tokenInflight.get(apiKey);
  if (inflight) return inflight;

  const exchange = (async () => {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'api_key', api_key: apiKey }),
    });
    if (!response.ok) {
      throw new Error(
        `Highflame token exchange failed: ${response.status} ${response.statusText}`
      );
    }
    const data = (await response.json()) as {
      access_token: string;
      expires_in?: number;
    };
    const expiresAt =
      Date.now() + (data.expires_in ?? 3600) * 1000 - TOKEN_REFRESH_BUFFER_MS;
    tokenCache.set(apiKey, { token: data.access_token, expiresAt });
    return data.access_token;
  })();

  tokenInflight.set(apiKey, exchange);
  try {
    return await exchange;
  } finally {
    tokenInflight.delete(apiKey);
  }
}

async function callHighflameGuard(
  text: string,
  contentType: string,
  action: string,
  credentials: HighflameCredentials,
  parameters: PluginParameters
): Promise<HighflameGuardResponse> {
  const domain = (credentials.domain || DEFAULT_DOMAIN).replace(
    /^https?:\/\//,
    ''
  );
  const tokenUrl = credentials.tokenUrl || DEFAULT_TOKEN_URL;
  const token = await getToken(credentials.apiKey, tokenUrl);

  const body: Record<string, unknown> = {
    content: text,
    content_type: contentType,
    action,
    mode: (parameters.mode as string) || 'enforce',
  };
  const detectors = resolveDetectors(
    parameters.capabilities as string[] | undefined
  );
  if (detectors.length) body.detectors = detectors;
  if (credentials.application) body.application = credentials.application;

  const response = await fetch(`https://${domain}/v1/shield/guard`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Highflame guard API error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }
  return (await response.json()) as HighflameGuardResponse;
}

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = true;
  let data = null;

  const credentials = parameters.credentials as unknown as HighflameCredentials;
  if (!credentials?.apiKey) {
    return {
      error: `'parameters.credentials.apiKey' must be set`,
      verdict: true,
      data,
    };
  }
  if (!credentials?.application) {
    return {
      error: `'parameters.credentials.application' must be set`,
      verdict: true,
      data,
    };
  }

  const { content, textArray } = getCurrentContentPart(context, eventType);
  if (!content) {
    return {
      error: { message: 'request or response json is empty' },
      verdict: true,
      data: null,
    };
  }
  const text = textArray.filter((t) => t).join('\n');

  try {
    const contentType =
      eventType === 'beforeRequestHook' ? 'prompt' : 'response';
    const guardResponse = await callHighflameGuard(
      text,
      contentType,
      'process_prompt',
      credentials,
      parameters
    );
    data = guardResponse as any;
    // verdict=false means the guardrail tripped (content violates policy).
    verdict = guardResponse.decision !== 'deny';
  } catch (e) {
    // Fail open: a Highflame outage must not hard-block gateway traffic.
    error = e instanceof Error ? e.message : String(e);
    verdict = true;
    data = null;
  }

  return { error, verdict, data };
};
