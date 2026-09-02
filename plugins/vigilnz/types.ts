/**
 * File: types.ts
 * Description: Wire types for the gateway-neutral Vigilnz Guardrail Scan API.
 *              Kept free of any Portkey-specific concept so the same client can be
 *              reused by adapters for other gateways (LiteLLM, TrueFoundry, Kong, ...).
 * Author: Susenthiran S (susenthiran.s@vigilnz.com)
 * Creation date: 2026-08-13
 */

export type VigilnzStage = 'input' | 'output';

export type VigilnzAction = 'allow' | 'block' | 'modify';

export interface VigilnzCredentials {
  readonly apiKey: string;
  readonly baseUrl?: string;
}

export interface VigilnzMessage {
  readonly role: string;
  readonly content: string;
}

export interface VigilnzScanRequest {
  readonly stage: VigilnzStage;
  readonly messages?: readonly VigilnzMessage[];
  readonly text?: string;
  readonly model?: string;
  readonly provider?: string;
  readonly session_id?: string;
  readonly gateway?: string;
  readonly redact?: boolean;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface VigilnzThreat {
  readonly category: string;
  readonly severity: string | number;
  readonly reason: string;
  readonly method?: string;
}

export interface VigilnzScanResponse {
  readonly action: VigilnzAction;
  readonly stage: VigilnzStage;
  readonly decision: string;
  readonly reason: string;
  readonly threats: readonly VigilnzThreat[];
  readonly modified_content: string | null;
  readonly enforcement: string;
  readonly scan_id: string;
  readonly latency_ms: number;
  readonly fail_closed: boolean;
}

/**
 * Type guard for a well-formed Vigilnz Guardrail API verdict.
 * @param value - Parsed JSON body returned by the Vigilnz Guardrail API.
 * @returns true when the body carries a usable verdict.
 */
export function isVigilnzScanResponse(
  value: unknown
): value is VigilnzScanResponse {
  if (typeof value !== 'object' || value === null) return false;
  const action = (value as Record<string, unknown>).action;
  return action === 'allow' || action === 'block' || action === 'modify';
}
