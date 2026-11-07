/**
 * @file src/mcp/utils/policyMetrics.ts
 * Prometheus metrics for external policy evaluation (Obsidian) on MCP tool
 * calls.
 *
 * Registered on prom-client's default registry, the same one the gateway's
 * /metrics endpoint serves. This module deliberately does not import
 * apm/prometheus/prometheusClient, which has startup side effects (it can exit
 * the process on bad Prometheus config) that the MCP path should not inherit.
 *
 * Label cardinality is kept low on purpose: no tool names, users or sessions.
 *
 * Recording never throws: metrics must not be able to fail a tool call.
 */

import client from 'prom-client';
import type { DecisionKind, ObsidianStage } from '../services/obsidianPolicy';

export const POLICY_EVALUATIONS_METRIC = 'mcp_policy_evaluations_total';
export const POLICY_DURATION_METRIC =
  'mcp_policy_evaluation_duration_milliseconds';

/** Milliseconds. Covers a fast verdict through a full timeout. */
const DURATION_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

const LABELS = ['server', 'stage', 'decision', 'outcome', 'source'] as const;

function getOrCreateCounter() {
  return (
    (client.register.getSingleMetric(POLICY_EVALUATIONS_METRIC) as
      | client.Counter<(typeof LABELS)[number]>
      | undefined) ??
    new client.Counter({
      name: POLICY_EVALUATIONS_METRIC,
      help: 'MCP tool-call policy evaluations. decision: pass|warn|block|not_evaluated|error. outcome: allowed|denied. source: verdict (policy engine answered) or fail_mode (it did not, and the fail mode decided).',
      labelNames: [...LABELS],
      registers: [client.register],
    })
  );
}

function getOrCreateHistogram() {
  return (
    (client.register.getSingleMetric(POLICY_DURATION_METRIC) as
      | client.Histogram<(typeof LABELS)[number]>
      | undefined) ??
    new client.Histogram({
      name: POLICY_DURATION_METRIC,
      help: 'Time spent waiting on the policy engine per evaluation, in milliseconds. This is latency added to every checked tool call.',
      labelNames: [...LABELS],
      buckets: DURATION_BUCKETS_MS,
      registers: [client.register],
    })
  );
}

export interface PolicyEvaluationSample {
  /** MCP server id (bounded by configuration). */
  server: string;
  stage: ObsidianStage;
  decision: DecisionKind;
  allowed: boolean;
  /** True when the fail mode, not a verdict, decided the outcome. */
  viaFailMode: boolean;
  durationMs: number;
}

/** Record one policy evaluation. Safe to call from the request path. */
export function recordPolicyEvaluation(sample: PolicyEvaluationSample): void {
  try {
    const labels = {
      server: sample.server,
      stage: sample.stage,
      decision: sample.decision,
      outcome: sample.allowed ? 'allowed' : 'denied',
      source: sample.viaFailMode ? 'fail_mode' : 'verdict',
    };
    getOrCreateCounter().inc(labels);
    getOrCreateHistogram().observe(labels, Math.max(0, sample.durationMs));
  } catch {
    // Never let metrics break a tool call.
  }
}
