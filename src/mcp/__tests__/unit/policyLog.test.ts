import {
  describe,
  test,
  expect,
  jest,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from '@jest/globals';
import {
  evaluateToolEvent,
  ObsidianEnvConfig,
  ToolEventInput,
} from '../../services/obsidianPolicy';
import { MockObsidianServer } from '../MockObsidianServer';

// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

describe('per-evaluation log line', () => {
  let mock: MockObsidianServer;
  let config: ObsidianEnvConfig;
  let spy: ReturnType<typeof jest.spyOn>;

  /** Log lines emitted by the policy client since the last reset. */
  const policyLines = () =>
    spy.mock.calls
      .map((c: unknown[]) => stripAnsi(String(c[0])))
      .filter((l: string) => l.includes('[mcp/obsidianPolicy]'));

  const input = (
    toolName: string,
    over: Partial<ToolEventInput> = {}
  ): ToolEventInput => ({
    stage: 'PreToolUse',
    serverId: 'echo-server',
    toolName,
    args: { value: 'ARGS-SECRET' },
    sessionId: 'abcdef0123456789',
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
    mock.reset();
    spy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    spy.mockRestore();
  });

  test('pass: one INFO line with the verdict, evaluation id and timing', async () => {
    const d = await evaluateToolEvent(input('read_file'), config);
    const lines = policyLines();
    expect(lines).toHaveLength(1);
    const line = lines[0];
    expect(line).toContain('[INFO]');
    expect(line).toContain('Policy stage=PreToolUse server=echo-server');
    expect(line).toContain('tool=read_file');
    expect(line).toContain('decision=pass allowed=true source=verdict');
    expect(line).toContain(`evaluation_id=${d.evaluationId}`);
    expect(line).toMatch(/duration_ms=\d+/);
    expect(line).toContain('session=abcdef01'); // 8 chars only
    expect(line).not.toContain('abcdef0123');
    expect(line).not.toContain('reason=');
    expect(line).not.toContain('fail_mode=');
  });

  test('block: a WARN line with the policy reason', async () => {
    await evaluateToolEvent(input('blocked_x'), config);
    const [line] = policyLines();
    expect(line).toContain('[WARN]');
    expect(line).toContain('decision=block allowed=false source=verdict');
    expect(line).toContain('reason="Tool blocked by test policy"');
    expect(line).toMatch(/evaluation_id=eval-\d+/);
  });

  test('warn: a WARN line, allowed', async () => {
    await evaluateToolEvent(input('warn_x'), config);
    const [line] = policyLines();
    expect(line).toContain('[WARN]');
    expect(line).toContain('decision=warn allowed=true');
    expect(line).toContain('reason="Flagged by test policy"');
  });

  test('PostToolUse is labelled with its stage', async () => {
    await evaluateToolEvent(
      input('read_file', { stage: 'PostToolUse', toolResponse: { ok: 1 } }),
      config
    );
    expect(policyLines()[0]).toContain('stage=PostToolUse');
  });

  test('not evaluated: fail mode and missing evaluation id are visible', async () => {
    await evaluateToolEvent(input('noeval_x'), config);
    const [line] = policyLines();
    expect(line).toContain('decision=not_evaluated allowed=false');
    expect(line).toContain('source=fail_mode');
    expect(line).toContain('evaluation_id=-');
    expect(line).toContain('fail_mode=closed');
    expect(line).toContain('No policy set');
  });

  test('outage with fail-open: allowed, and says so', async () => {
    await evaluateToolEvent(input('error_x'), config, { failMode: 'open' });
    const lines = policyLines();
    // Retried once, but still exactly one line per evaluation.
    expect(mock.requests).toHaveLength(2);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('decision=error allowed=true');
    expect(lines[0]).toContain('source=fail_mode');
    expect(lines[0]).toContain('fail_mode=open');
    expect(lines[0]).toContain('HTTP 500');
  });

  test('timeout: one line, with the elapsed time and the reason', async () => {
    await evaluateToolEvent(input('slow_x'), config, { timeoutMs: 200 });
    const lines = policyLines();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('decision=error allowed=false');
    expect(lines[0]).toContain('timed out after 200ms');
    const ms = Number(/duration_ms=(\d+)/.exec(lines[0])![1]);
    expect(ms).toBeGreaterThanOrEqual(190);
  });

  test('never logs arguments, results or the token', async () => {
    await evaluateToolEvent(
      input('read_file', {
        stage: 'PostToolUse',
        toolResponse: { text: 'RESULT-SECRET' },
      }),
      config
    );
    await evaluateToolEvent(input('blocked_x'), config);
    const all = policyLines().join('\n');
    expect(all).not.toContain('ARGS-SECRET');
    expect(all).not.toContain('RESULT-SECRET');
    expect(all).not.toContain(mock.token);
  });

  test('a hostile reason cannot break the format or inject extra lines', async () => {
    const hostile = {
      version: '1.0',
      evaluation_id: 'eval-x',
      decision: 'block',
      matched_policies: [],
      message: 'bad\n[INFO] Policy decision=pass allowed=true "quoted"',
    };
    const fakeFetch = (async () =>
      new Response(JSON.stringify(hostile), {
        status: 200,
      })) as unknown as typeof fetch;
    await evaluateToolEvent(
      input('read_file'),
      config,
      {},
      { fetch: fakeFetch }
    );
    // One console call, no raw newline: the reason is JSON-escaped.
    expect(
      spy.mock.calls.filter((c: unknown[]) => String(c[0]).includes('Policy'))
    ).toHaveLength(1);
    const [line] = policyLines();
    expect(line).not.toContain('\n');
    expect(line).toContain('decision=block allowed=false');
    expect(line).toContain('\\n[INFO] Policy decision=pass');
    expect(line).toContain('\\"quoted\\"');
  });

  test('a logging failure never affects the decision', async () => {
    spy.mockImplementation(() => {
      throw new Error('stdout closed');
    });
    const d = await evaluateToolEvent(input('read_file'), config);
    expect(d).toMatchObject({ allowed: true, kind: 'pass' });
  });
});
