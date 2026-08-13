/**
 * File: client.ts
 * Description: Gateway-agnostic HTTP client for the Vigilnz Guardrail Scan API.
 *              Contains no Portkey types, so any other gateway adapter can reuse it.
 * Author: Susenthiran S (susenthiran.s@vigilnz.com)
 * Creation date: 2026-08-13
 */

import { post } from '../utils';
import { VERSION } from './version';
import {
  isVigilnzScanResponse,
  VigilnzCredentials,
  VigilnzScanRequest,
  VigilnzScanResponse,
} from './types';

/** Managed Vigilnz AI Secure endpoint used when no baseUrl is configured. */
export const VIGILNZ_DEFAULT_BASE_URL = 'https://devaigw.vigilnz.com';

/** Path of the gateway-neutral guardrail scan endpoint. */
export const VIGILNZ_SCAN_PATH = '/api/guardrail/scan';

/** Default verdict timeout in milliseconds. */
export const VIGILNZ_DEFAULT_TIMEOUT_MS = 5000;

/** Required prefix of a Vigilnz API key. */
const API_KEY_PREFIX = 'vpsk_live_';

/** Hostnames for which a plain-http baseUrl is permitted (local development). */
const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1', '[::1]'];

/**
 * Resolve and validate the Vigilnz guardrail endpoint.
 * Priority: guardrail credentials > gateway environment > managed default.
 * @param credentials - Guardrail credentials configured by the user.
 * @param env - Gateway environment bindings (may carry VIGILNZ_GUARDRAIL_BASE_URL).
 * @returns Absolute scan URL.
 * @throws {Error} When a configured baseUrl is not a valid https URL.
 */
export function resolveScanUrl(
  credentials: VigilnzCredentials,
  env?: Record<string, unknown>
): string {
  const envBaseUrl = env?.VIGILNZ_GUARDRAIL_BASE_URL;
  const configured =
    credentials.baseUrl?.trim() ||
    (typeof envBaseUrl === 'string' ? envBaseUrl.trim() : '') ||
    VIGILNZ_DEFAULT_BASE_URL;

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error('Invalid Vigilnz base URL');
  }

  const isLocal = LOCAL_HOSTNAMES.includes(parsed.hostname);
  if (
    parsed.protocol !== 'https:' &&
    !(parsed.protocol === 'http:' && isLocal)
  ) {
    throw new Error('Vigilnz base URL must use https');
  }

  return `${configured.replace(/\/+$/, '')}${VIGILNZ_SCAN_PATH}`;
}

/**
 * Validate the shape of the Vigilnz API key before any network call is made.
 * @param credentials - Guardrail credentials configured by the user.
 * @throws {Error} When the key is missing or malformed.
 */
export function assertCredentials(
  credentials?: VigilnzCredentials
): asserts credentials is VigilnzCredentials {
  const apiKey = credentials?.apiKey?.trim();
  if (!apiKey) {
    throw new Error('Vigilnz API key is not configured');
  }
  if (!apiKey.startsWith(API_KEY_PREFIX)) {
    throw new Error(
      `Invalid Vigilnz API key format (expected ${API_KEY_PREFIX} prefix)`
    );
  }
}

/**
 * Call the Vigilnz Guardrail Scan API and return its verdict.
 * @param credentials - Vigilnz API key (+ optional self-hosted base URL).
 * @param request - Neutral scan request.
 * @param timeoutMs - Verdict timeout in milliseconds.
 * @param env - Gateway environment bindings.
 * @returns The Vigilnz verdict.
 * @throws {Error | HttpError | TimeoutError} On auth failure, outage, timeout or bad body.
 */
export async function scanWithVigilnz(
  credentials: VigilnzCredentials | undefined,
  request: VigilnzScanRequest,
  timeoutMs: number = VIGILNZ_DEFAULT_TIMEOUT_MS,
  env?: Record<string, unknown>
): Promise<VigilnzScanResponse> {
  assertCredentials(credentials);
  const url = resolveScanUrl(credentials, env);

  const response = await post(
    url,
    request,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credentials.apiKey}`,
        'User-Agent': `vigilnz-guardrail-adapter/${VERSION}`,
      },
    },
    timeoutMs
  );

  if (!isVigilnzScanResponse(response)) {
    throw new Error('Invalid response from Vigilnz Guardrail API');
  }

  return response;
}
