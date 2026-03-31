/**
 * Akto HTTP clients: guardrails validate (`/api/validate/request`) and Cyborg heartbeat
 * (`updateModuleInfoForHeartbeat`). Used by `plugins/akto/scan.ts` and Node startup.
 */

import { version as gatewayVersion } from '../../package.json';
import { post } from '../plugins/utils';
import { logger } from '../apm';

const AKTO_ULTRON_BASE = 'https://ultron.akto.io/api';
const DEFAULT_HEARTBEAT_URL = `${AKTO_ULTRON_BASE}/updateModuleInfoForHeartbeat`;
const DEFAULT_COLLECTION_CREATION_URL = `${AKTO_ULTRON_BASE}/createCollectionForHostAndVpc`;
const HEARTBEAT_MODULE_TYPE = 'MCP_ENDPOINT_SHIELD';
const HEARTBEAT_TIMEOUT_MS = 10_000;

function trim(v: string | undefined): string {
  return typeof v === 'string' ? v.trim() : '';
}

function isAktoDebug(): boolean {
  return (
    typeof process !== 'undefined' &&
    typeof process.env.AKTO_DEBUG === 'string' &&
    process.env.AKTO_DEBUG !== '' &&
    process.env.AKTO_DEBUG !== '0' &&
    process.env.AKTO_DEBUG.toLowerCase() !== 'false'
  );
}

function aktoDebug(label: string, data: Record<string, unknown>): void {
  if (!isAktoDebug()) return;
  logger.info({ message: `[Akto:${label}] ${JSON.stringify(data)}` });
}

const AI_GATEWAY_PORTKEY_HOST_LABELS = 'ai-gateway.portkey';

function generateAktoHostId(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  let id = '';
  for (let i = 0; i < 16; i++) {
    id += buf[i]!.toString(16).padStart(2, '0');
  }
  return id;
}

const aktoHostId = generateAktoHostId();
export const hostName = `${aktoHostId}.${AI_GATEWAY_PORTKEY_HOST_LABELS}`;

/** Body shape for Akto `/api/validate/request` (browser extension style). */
export interface AktoScanRequest {
  requestHeaders: string;
  path: string;
  method: string;
  requestPayload: string;
  ip: string;
  time: string;
  statusCode: string;
  status: string;
  tag: string;
  metadata: string;
  contextSource: string;
  source: string;
}

export interface AktoScanResponse {
  Allowed: boolean;
  Modified: boolean;
  ModifiedPayload: string;
  Reason: string;
  Metadata: {
    [key: string]: unknown;
  };
}

export interface AktoHeartbeatPayload {
  moduleInfo: {
    id: string;
    name: string;
    moduleType: string;
    currentVersion: string;
    startedTs: number;
    lastHeartbeatReceived: number;
    additionalData: {
      username: string;
      mcpServers: Record<string, unknown>;
    };
  };
}

export interface AktoHostCollectionTag {
  lastUpdatedTs: number;
  keyName: string;
  value: string;
  source: 'USER';
}

export interface AktoHostCollectionPayload {
  colId: number;
  host: string;
  tagsList: AktoHostCollectionTag[];
}

export function buildAktoHostCollectionPayload(
  hostname: string
): AktoHostCollectionPayload {
  const colId = Math.floor(Date.now() / 1000);
  const lastUpdatedTs = colId;
  const tagsList: AktoHostCollectionTag[] = [
    {
      lastUpdatedTs,
      keyName: 'gen-ai',
      value: 'Gen AI',
      source: 'USER',
    },
    {
      lastUpdatedTs,
      keyName: 'source',
      value: 'PORTKEY',
      source: 'USER',
    },
    {
      lastUpdatedTs,
      keyName: 'mcp-server',
      value: 'MCP Server',
      source: 'USER',
    },
    {
      lastUpdatedTs,
      keyName: 'mcp-client',
      value: 'portkey-ai-gateway',
      source: 'USER',
    },
  ];

  return {
    colId,
    host: hostname,
    tagsList,
  };
}

export function buildAktoHeartbeatPayload(
  moduleId: string,
  name: string,
  username: string
): AktoHeartbeatPayload {
  const nowS = Math.floor(Date.now() / 1000);
  return {
    moduleInfo: {
      id: moduleId,
      name,
      moduleType: HEARTBEAT_MODULE_TYPE,
      currentVersion: gatewayVersion,
      startedTs: nowS,
      lastHeartbeatReceived: nowS,
      additionalData: {
        username: username || '',
        mcpServers: {},
      },
    },
  };
}

/**
 * POST Cyborg heartbeat (extension `sendHeartbeat` style: raw JWT in `authorization`).
 */
export async function postAktoHeartbeat(
  url: string,
  rawJwt: string,
  payload: AktoHeartbeatPayload,
  timeoutMs: number = HEARTBEAT_TIMEOUT_MS
): Promise<Response> {
  aktoDebug('heartbeat:req', { url, payload });
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: rawJwt,
      },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    if (isAktoDebug()) {
      const resBody = await res
        .clone()
        .text()
        .catch(() => '');
      aktoDebug('heartbeat:res', { status: res.status, body: resBody });
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function postAktoHostCollectionRegistration(
  url: string,
  rawJwt: string,
  payload: AktoHostCollectionPayload,
  timeoutMs: number = HEARTBEAT_TIMEOUT_MS
): Promise<Response> {
  aktoDebug('collection:req', { url, payload });
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: rawJwt,
      },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    if (isAktoDebug()) {
      const resBody = await res
        .clone()
        .text()
        .catch(() => '');
      aktoDebug('collection:res', { status: res.status, body: resBody });
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** Node startup: send heartbeat if `PORTKEY_AKTO_API_KEY` is set. */
export async function runAktoGatewayHeartbeatOnStartup(
  rawJwtOverride?: string
): Promise<void> {
  const token = trim(rawJwtOverride) || trim(process.env.PORTKEY_AKTO_API_KEY);
  if (!token) return;

  const nowS = Math.floor(Date.now() / 1000);
  const payload: AktoHeartbeatPayload = {
    moduleInfo: {
      id: aktoHostId,
      name: aktoHostId,
      moduleType: HEARTBEAT_MODULE_TYPE,
      currentVersion: gatewayVersion,
      startedTs: nowS,
      lastHeartbeatReceived: nowS,
      additionalData: {
        username: aktoHostId || '',
        mcpServers: {},
      },
    },
  };

  try {
    const res = await postAktoHeartbeat(DEFAULT_HEARTBEAT_URL, token, payload);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.warn({
        message: `[Akto heartbeat] non-OK response: ${res.status} ${body.slice(0, 300)}`,
      });
    }
  } catch (e) {
    logger.warn({
      message: `[Akto heartbeat] request failed: ${e instanceof Error ? e.message : e}`,
    });
  }
}

/** Node startup: register host collection once if `PORTKEY_AKTO_API_KEY` is set. */
export async function runAktoHostCollectionRegistrationOnStartup(
  rawJwtOverride?: string
): Promise<void> {
  const token = trim(rawJwtOverride) || trim(process.env.PORTKEY_AKTO_API_KEY);
  if (!token) return;
  const payload = buildAktoHostCollectionPayload(hostName);
  try {
    const res = await postAktoHostCollectionRegistration(
      DEFAULT_COLLECTION_CREATION_URL,
      token,
      payload
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.warn({
        message: `[Akto collection registration] non-OK response: ${res.status} ${body.slice(0, 300)}`,
      });
    }
  } catch (e) {
    logger.warn({
      message: `[Akto collection registration] request failed: ${e instanceof Error ? e.message : e}`,
    });
  }
}

export async function postAktoValidateRequest(
  apiUrl: string,
  body: AktoScanRequest,
  bearerJwt: string,
  timeoutMs: number
): Promise<AktoScanResponse> {
  aktoDebug('validate:req', {
    url: apiUrl,
    body: body as unknown as Record<string, unknown>,
  });
  const result = await post<AktoScanResponse>(
    apiUrl,
    body,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearerJwt}`,
        'User-Agent': 'portkey-ai-gateway/1.0.0',
      },
    },
    timeoutMs
  );
  aktoDebug('validate:res', {
    result: result as unknown as Record<string, unknown>,
  });
  return result;
}
