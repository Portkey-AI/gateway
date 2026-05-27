// SPDX-License-Identifier: Apache-2.0
//
// Veto guardrail plugin for Portkey AI Gateway.
//
// No detection logic here — this is a thin HTTP client that calls the hosted
// Veto gateway (POST {apiBase}/v1/check) and maps Veto's verdict onto
// Portkey's PluginHandler contract. Detection lives in veto-core.
//
// Reference pattern: Portkey's own Lakera Guard plugin (PR #1647) — reads/writes
// content via the shared ../utils helpers, posts via `post`, catches HttpError.

import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import {
  getCurrentContentPart,
  setCurrentContentPart,
  post,
  HttpError,
} from '../utils';

interface VetoFinding {
  category: string;
  rule: string;
  severity: string;
  match?: string;
  start?: number;
  end?: number;
  score?: number;
}

interface VetoVerdict {
  allowed: boolean;
  action: 'allow' | 'redact' | 'block';
  findings: VetoFinding[];
  redacted?: string;
  latency_ms: number;
  degraded?: string[];
}

const DEFAULT_API_BASE = 'https://api.vetocheck.com';

// Strip `match`/offsets before anything is logged: the matched substring is the
// raw PII/secret value and must never reach Portkey's request logs.
function safeData(verdict: VetoVerdict, extra: Record<string, unknown> = {}) {
  return {
    action: verdict.action,
    findings: (verdict.findings ?? []).map((f) => ({
      category: f.category,
      rule: f.rule,
      severity: f.severity,
      score: f.score,
    })),
    degraded: verdict.degraded ?? [],
    ...extra,
  };
}

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  const transformedData: Record<string, any> = {
    request: { json: null, text: null },
    response: { json: null, text: null },
  };

  try {
    const credentials = (parameters.credentials ?? {}) as {
      apiKey?: string;
      apiBase?: string;
    };
    if (!credentials.apiKey) {
      // Fail-closed: with no key we cannot scan, so we must not pass text through.
      return {
        error: new Error('veto: missing credentials.apiKey'),
        verdict: false,
        data: null,
      };
    }
    const apiBase = (credentials.apiBase || DEFAULT_API_BASE).replace(
      /\/$/,
      ''
    );
    const applyRedaction = parameters.redact !== false;
    const timeout =
      typeof parameters.timeout === 'number' ? parameters.timeout : 30000;

    // Text parts of the current content (last request message / response
    // choice). Multimodal messages yield several entries; image/audio parts
    // surface as '' and are skipped.
    const { textArray } = getCurrentContentPart(context, eventType);
    const nonEmpty = textArray
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => typeof t === 'string' && t.trim());

    if (nonEmpty.length === 0) {
      return {
        error: null,
        verdict: true,
        data: { action: 'allow', skipped: 'empty' },
      };
    }

    const text = nonEmpty.map(({ t }) => t).join('\n');
    const body: Record<string, unknown> = { text };
    if (Array.isArray(parameters.categories)) {
      body.categories = parameters.categories;
    }

    const verdict = await post<VetoVerdict>(
      `${apiBase}/v1/check`,
      body,
      { headers: { Authorization: `Bearer ${credentials.apiKey}` } },
      timeout
    );

    if (verdict.action === 'block') {
      return { error: null, verdict: false, data: safeData(verdict) };
    }

    if (verdict.action === 'redact' && applyRedaction && verdict.redacted) {
      // Veto returns a single redacted blob. We can re-split it onto the
      // content parts only when exactly one part was scanned.
      if (nonEmpty.length === 1) {
        const maskedArray: Array<string | null> = [...textArray];
        maskedArray[nonEmpty[0].i] = verdict.redacted;
        setCurrentContentPart(context, eventType, transformedData, maskedArray);
        return {
          error: null,
          verdict: true,
          transformed: true,
          transformedData,
          data: safeData(verdict),
        };
      }
      // Multiple text parts were joined for the scan; the redacted blob can't be
      // safely re-split. Fail safe — block rather than forward unredacted text.
      return {
        error: null,
        verdict: false,
        data: safeData(verdict, {
          note: 'multi-part redact cannot be re-split; blocked',
        }),
      };
    }

    return { error: null, verdict: true, data: safeData(verdict) };
  } catch (e: any) {
    // Fail-closed on non-2xx (HttpError) / network error / timeout: when Veto is
    // unreachable the adapter can't resolve the org's tier config, so it applies
    // the safe default instead of passing unscanned text (SPEC §3.6 adapter note).
    const data =
      e instanceof HttpError ? { httpStatus: e.response?.status } : null;
    return { error: e, verdict: false, data };
  }
};
