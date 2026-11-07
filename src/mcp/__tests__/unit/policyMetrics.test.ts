import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from '@jest/globals';
import client from 'prom-client';
import {
  POLICY_DURATION_METRIC,
  POLICY_EVALUATIONS_METRIC,
  recordPolicyEvaluation,
} from '../../utils/policyMetrics';
import {
  evaluateToolEvent,
  ObsidianEnvConfig,
  ToolEventInput,
} from '../../services/obsidianPolicy';
import { MockObsidianServer } from '../MockObsidianServer';

type Labels = Record<string, string>;

async function counterValue(labels: Labels): Promise<number> {
  const metric = client.register.getSingleMetric(POLICY_EVALUATIONS_METRIC);
  if (!metric) return 0;
  const { values } = await (metric as client.Counter<string>).get();
  const hit = values.find((v) =>
    Object.entries(labels).every(([k, val]) => v.labels[k] === val)
  );
  return hit?.value ?? 0;
}

async function histogramStat(
  suffix: '_count' | '_sum',
  labels: Labels
): Promise<number> {
  const metric = client.register.getSingleMetric(POLICY_DURATION_METRIC);
  if (!metric) return 0;
  const { values } = await (metric as client.Histogram<string>).get();
  const hit = values.find(
    (v) =>
      (v as { metricName?: string }).metricName ===
        `${POLICY_DURATION_METRIC}${suffix}` &&
      Object.entries(labels).every(([k, val]) => v.labels[k] === val)
  );
  return hit?.value ?? 0;
}

describe('recordPolicyEvaluation', () => {
  beforeEach(() => client.register.resetMetrics());

  test('counts an evaluation with its labels and observes its duration', async () => {
    recordPolicyEvaluation({
      server: 'github',
      stage: 'PreToolUse',
      decision: 'block',
      allowed: false,
      viaFailMode: false,
      durationMs: 42,
    });
    const labels = {
      server: 'github',
      stage: 'PreToolUse',
      decision: 'block',
      outcome: 'denied',
      source: 'verdict',
    };
    expect(await counterValue(labels)).toBe(1);
    expect(await histogramStat('_count', labels)).toBe(1);
    expect(await histogramStat('_sum', labels)).toBe(42);
  });

  test('labels fail-mode outcomes separately from verdicts', async () => {
    recordPolicyEvaluation({
      server: 's',
      stage: 'PostToolUse',
      decision: 'error',
      allowed: true,
      viaFailMode: true,
      durationMs: 0,
    });
    expect(
      await counterValue({
        decision: 'error',
        outcome: 'allowed',
        source: 'fail_mode',
      })
    ).toBe(1);
  });

  test('never throws, and clamps a negative duration', async () => {
    expect(() =>
      recordPolicyEvaluation({
        server: 's',
        stage: 'PreToolUse',
        decision: 'pass',
        allowed: true,
        viaFailMode: false,
        durationMs: -5,
      })
    ).not.toThrow();
    expect(await histogramStat('_sum', { server: 's', decision: 'pass' })).toBe(
      0
    );
  });
});

describe('metrics produced by evaluateToolEvent', () => {
  let mock: MockObsidianServer;
  let config: ObsidianEnvConfig;

  const input = (
    toolName: string,
    over: Partial<ToolEventInput> = {}
  ): ToolEventInput => ({
    stage: 'PreToolUse',
    serverId: 'srv',
    toolName,
    sessionId: 's1',
    ...over,
  });

  beforeAll(async () => {
    mock = new MockObsidianServer({ slowMs: 600 });
    config = {
      endpoint: await mock.start(),
      gatewayToken: mock.token,
      clientPlatform: 'acme_gw',
      timeoutMs: 2000,
    };
  });
  afterAll(async () => {
    await mock.stop();
  });
  beforeEach(() => {
    client.register.resetMetrics();
    mock.reset();
  });

  test('pass is allowed by verdict', async () => {
    await evaluateToolEvent(input('read_file'), config);
    expect(
      await counterValue({
        server: 'srv',
        stage: 'PreToolUse',
        decision: 'pass',
        outcome: 'allowed',
        source: 'verdict',
      })
    ).toBe(1);
  });

  test('block is denied by verdict, even in fail-open mode', async () => {
    await evaluateToolEvent(input('blocked_x'), config, { failMode: 'open' });
    expect(
      await counterValue({
        decision: 'block',
        outcome: 'denied',
        source: 'verdict',
      })
    ).toBe(1);
  });

  test('a PostToolUse evaluation is labelled with its stage', async () => {
    await evaluateToolEvent(
      input('read_file', { stage: 'PostToolUse', toolResponse: { ok: 1 } }),
      config
    );
    expect(await counterValue({ stage: 'PostToolUse' })).toBe(1);
  });

  test('not evaluated is attributed to the fail mode', async () => {
    await evaluateToolEvent(input('noeval_x'), config);
    expect(
      await counterValue({
        decision: 'not_evaluated',
        outcome: 'denied',
        source: 'fail_mode',
      })
    ).toBe(1);
  });

  test('an outage is an error decided by the fail mode', async () => {
    await evaluateToolEvent(input('error_x'), config, { failMode: 'open' });
    expect(
      await counterValue({
        decision: 'error',
        outcome: 'allowed',
        source: 'fail_mode',
      })
    ).toBe(1);
  });

  test('a timeout records one evaluation whose duration is the wait', async () => {
    await evaluateToolEvent(input('slow_x'), config, { timeoutMs: 200 });
    const labels = { decision: 'error', source: 'fail_mode' };
    expect(await counterValue(labels)).toBe(1);
    // Waited about the timeout, and clearly not the mock's 600ms.
    const sum = await histogramStat('_sum', labels);
    expect(sum).toBeGreaterThanOrEqual(190);
    expect(sum).toBeLessThan(550);
  });

  test('keeps counting across calls', async () => {
    await evaluateToolEvent(input('read_file'), config);
    await evaluateToolEvent(input('read_file'), config);
    expect(await counterValue({ decision: 'pass' })).toBe(2);
  });
});
