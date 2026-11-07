import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  jest,
} from '@jest/globals';
import {
  buildEvent,
  evaluateToolEvent,
  isStageEnabled,
  loadObsidianEnvConfig,
  validateClientPlatform,
  DEFAULT_CLIENT_PLATFORM,
  DEFAULT_OBSIDIAN_ENDPOINT,
  ObsidianEnvConfig,
  ToolEventInput,
} from '../../services/obsidianPolicy';
import { MockObsidianServer } from '../MockObsidianServer';

// The policy client writes one log line per evaluation; keep test output quiet.
// policyLog.test.ts covers the line itself.
let consoleSpy: ReturnType<typeof jest.spyOn>;
beforeAll(() => {
  consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterAll(() => consoleSpy.mockRestore());

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('validateClientPlatform', () => {
  test('accepts ordinary names', () => {
    expect(validateClientPlatform('portkey_oss_gateway')).toBeNull();
    expect(validateClientPlatform('my.gateway-1')).toBeNull();
  });

  test('rejects reserved names, including case and dash variants', () => {
    for (const name of [
      'mcp_gateway',
      'MCP-Gateway',
      'mcpguard',
      'claudecode',
    ]) {
      expect(validateClientPlatform(name)).toMatch(/reserved/);
    }
  });

  test('rejects bad characters and over-long names', () => {
    expect(validateClientPlatform('has space')).toMatch(/must be/);
    expect(validateClientPlatform('')).toMatch(/must be/);
    expect(validateClientPlatform('a'.repeat(65))).toMatch(/must be/);
  });
});

describe('loadObsidianEnvConfig', () => {
  test('returns null when no gateway token is set', () => {
    expect(loadObsidianEnvConfig({})).toBeNull();
    expect(loadObsidianEnvConfig({ OBSIDIAN_GATEWAY_TOKEN: '  ' })).toBeNull();
  });

  test('applies defaults', () => {
    expect(loadObsidianEnvConfig({ OBSIDIAN_GATEWAY_TOKEN: 'tok' })).toEqual({
      endpoint: DEFAULT_OBSIDIAN_ENDPOINT,
      gatewayToken: 'tok',
      clientPlatform: DEFAULT_CLIENT_PLATFORM,
      timeoutMs: 2500,
      extendedContext: false,
    });
  });

  test('reads overrides', () => {
    const cfg = loadObsidianEnvConfig({
      OBSIDIAN_GATEWAY_TOKEN: 'tok',
      OBSIDIAN_ENDPOINT: 'http://localhost:1/x',
      OBSIDIAN_CLIENT_PLATFORM: 'acme_gw',
      OBSIDIAN_TIMEOUT_MS: '1000',
    });
    expect(cfg).toMatchObject({
      endpoint: 'http://localhost:1/x',
      clientPlatform: 'acme_gw',
      timeoutMs: 1000,
    });
  });

  test('throws on a reserved platform or a bad timeout', () => {
    expect(() =>
      loadObsidianEnvConfig({
        OBSIDIAN_GATEWAY_TOKEN: 'tok',
        OBSIDIAN_CLIENT_PLATFORM: 'mcp_gateway',
      })
    ).toThrow(/reserved/);
    for (const bad of ['abc', '50', '99999', '1.5']) {
      expect(() =>
        loadObsidianEnvConfig({
          OBSIDIAN_GATEWAY_TOKEN: 'tok',
          OBSIDIAN_TIMEOUT_MS: bad,
        })
      ).toThrow(/OBSIDIAN_TIMEOUT_MS/);
    }
  });
});

describe('isStageEnabled', () => {
  test('is off unless explicitly enabled', () => {
    expect(isStageEnabled(undefined, 'PreToolUse')).toBe(false);
    expect(isStageEnabled({}, 'PreToolUse')).toBe(false);
    expect(isStageEnabled({ enabled: false }, 'PreToolUse')).toBe(false);
  });

  test('defaults to both stages when enabled', () => {
    expect(isStageEnabled({ enabled: true }, 'PreToolUse')).toBe(true);
    expect(isStageEnabled({ enabled: true }, 'PostToolUse')).toBe(true);
  });

  test('honours an explicit stage list', () => {
    const policy = { enabled: true, stages: ['PreToolUse' as const] };
    expect(isStageEnabled(policy, 'PreToolUse')).toBe(true);
    expect(isStageEnabled(policy, 'PostToolUse')).toBe(false);
  });
});

describe('buildEvent', () => {
  const cfg = { clientPlatform: 'acme_gw' };
  const pre: ToolEventInput = {
    stage: 'PreToolUse',
    serverId: 'github',
    toolName: 'create_issue',
    args: { title: 'x' },
    sessionId: 'sess-1',
  };

  test('builds a PreToolUse event with the required fields', () => {
    const event: any = buildEvent(pre, cfg);
    expect(event).toMatchObject({
      version: '1.0',
      client_platform: 'acme_gw',
      stage: 'PreToolUse',
      session_id: 'sess-1',
      target_service: 'github',
      action_param: { tool_name: 'create_issue', args: { title: 'x' } },
    });
    expect(event.event_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(event.timestamp).toString()).not.toBe('Invalid Date');
    expect(event.action_param).not.toHaveProperty('tool_response');
    expect(event).not.toHaveProperty('user');
    expect(event).not.toHaveProperty('runtime_extension');
  });

  test('generates a new event_id each time', () => {
    expect((buildEvent(pre, cfg) as any).event_id).not.toBe(
      (buildEvent(pre, cfg) as any).event_id
    );
  });

  test('defaults args to an empty object', () => {
    const event: any = buildEvent({ ...pre, args: undefined }, cfg);
    expect(event.action_param.args).toEqual({});
  });

  test('includes tool_response on PostToolUse, as given', () => {
    const response = { content: [{ type: 'text', text: 'hi' }] };
    const event: any = buildEvent(
      { ...pre, stage: 'PostToolUse', toolResponse: response },
      cfg
    );
    expect(event.action_param.tool_response).toEqual(response);
  });

  test.each([[undefined], [null], ['']])(
    'substitutes {} when PostToolUse tool_response is %p',
    (value) => {
      const event: any = buildEvent(
        { ...pre, stage: 'PostToolUse', toolResponse: value },
        cfg
      );
      expect(event.action_param.tool_response).toEqual({});
    }
  );

  test('includes user, agent and runtime_extension only when provided', () => {
    const event: any = buildEvent(
      {
        ...pre,
        user: { id: 'u1', email: 'a@b.co' },
        agent: { id: 'ag1' },
        runtimeExtension: {
          namespace: 'portkey.mcp_gateway',
          version: '1',
          data: { workspace_id: 'ws1' },
        },
      },
      cfg
    );
    expect(event.user).toEqual({ id: 'u1', email: 'a@b.co' });
    expect(event.agent).toEqual({ id: 'ag1' });
    expect(event.runtime_extension.namespace).toBe('portkey.mcp_gateway');
    // Empty user/agent objects are omitted, not sent blank.
    const blank: any = buildEvent({ ...pre, user: {}, agent: {} }, cfg);
    expect(blank).not.toHaveProperty('user');
    expect(blank).not.toHaveProperty('agent');
  });
});

// ---------------------------------------------------------------------------
// evaluateToolEvent against the mock Obsidian server
// ---------------------------------------------------------------------------

describe('evaluateToolEvent', () => {
  let mock: MockObsidianServer;
  let config: ObsidianEnvConfig;

  const input = (
    toolName: string,
    over: Partial<ToolEventInput> = {}
  ): ToolEventInput => ({
    stage: 'PreToolUse',
    serverId: 'srv',
    toolName,
    args: { a: 1 },
    sessionId: 'sess-1',
    ...over,
  });

  beforeAll(async () => {
    mock = new MockObsidianServer({ slowMs: 600 });
    const endpoint = await mock.start();
    config = {
      endpoint,
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
    mock.forceStatus = undefined;
  });

  describe('verdicts', () => {
    test('pass: allowed, with the evaluation id', async () => {
      const d = await evaluateToolEvent(input('read_file'), config);
      expect(d).toMatchObject({
        allowed: true,
        kind: 'pass',
        viaFailMode: false,
      });
      expect(d.evaluationId).toBeTruthy();
    });

    test('warn: allowed, and the matched policy is surfaced', async () => {
      const d = await evaluateToolEvent(input('warn_thing'), config);
      expect(d).toMatchObject({ allowed: true, kind: 'warn' });
      expect(d.matchedPolicies[0]).toMatchObject({ action: 'warn' });
      expect(d.evaluationId).toBeTruthy();
    });

    test('block: denied, with the policy message', async () => {
      const d = await evaluateToolEvent(input('blocked_thing'), config);
      expect(d).toMatchObject({
        allowed: false,
        kind: 'block',
        message: 'Tool blocked by test policy',
        viaFailMode: false,
      });
      expect(d.evaluationId).toBeTruthy();
    });

    test('a real block is not overridden by fail-open', async () => {
      const d = await evaluateToolEvent(input('blocked_thing'), config, {
        failMode: 'open',
      });
      expect(d.allowed).toBe(false);
    });

    test('an unrecognised decision is treated as block, even fail-open', async () => {
      const d = await evaluateToolEvent(input('weird_thing'), config, {
        failMode: 'open',
      });
      expect(d).toMatchObject({ allowed: false, kind: 'block' });
      expect(d.message).toMatch(/something_else/);
    });

    test('PostToolUse: sensitive output is blocked', async () => {
      const d = await evaluateToolEvent(
        input('read_file', {
          stage: 'PostToolUse',
          toolResponse: { text: 'the SECRET key' },
        }),
        config
      );
      expect(d).toMatchObject({ allowed: false, kind: 'block' });
    });

    test('PostToolUse with an empty result is accepted, not a 400', async () => {
      const d = await evaluateToolEvent(
        input('read_file', { stage: 'PostToolUse', toolResponse: undefined }),
        config
      );
      expect(d).toMatchObject({ allowed: true, kind: 'pass' });
    });
  });

  describe('not evaluated (pass without evaluation_id)', () => {
    test('fail-closed by default: blocked', async () => {
      const d = await evaluateToolEvent(input('noeval_thing'), config);
      expect(d).toMatchObject({
        allowed: false,
        kind: 'not_evaluated',
        viaFailMode: true,
      });
      expect(d.evaluationId).toBeUndefined();
      expect(d.message).toMatch(/No policy set/);
    });

    test('fail-open: allowed, but still flagged as via fail mode', async () => {
      const d = await evaluateToolEvent(input('noeval_thing'), config, {
        failMode: 'open',
      });
      expect(d).toMatchObject({
        allowed: true,
        kind: 'not_evaluated',
        viaFailMode: true,
      });
    });
  });

  describe('failures follow the fail mode', () => {
    test('HTTP 500 is retried once, then fails closed', async () => {
      const d = await evaluateToolEvent(input('error_thing'), config);
      expect(d).toMatchObject({
        allowed: false,
        kind: 'error',
        viaFailMode: true,
      });
      expect(d.message).toMatch(/HTTP 500/);
      expect(mock.requests).toHaveLength(2);
    });

    test('HTTP 500 fails open when configured', async () => {
      const d = await evaluateToolEvent(input('error_thing'), config, {
        failMode: 'open',
      });
      expect(d).toMatchObject({ allowed: true, kind: 'error' });
    });

    test('a 4xx is not retried', async () => {
      const d = await evaluateToolEvent(input('read_file'), {
        ...config,
        gatewayToken: 'wrong-token',
      });
      expect(d).toMatchObject({ allowed: false, kind: 'error' });
      expect(d.message).toMatch(/HTTP 401/);
      expect(mock.requests).toHaveLength(1);
    });

    test('invalid JSON in a 200 response is an error', async () => {
      const d = await evaluateToolEvent(input('badjson_thing'), config);
      expect(d).toMatchObject({ allowed: false, kind: 'error' });
      expect(d.message).toMatch(/not valid JSON/);
    });

    test('timeout: fails closed and is NOT retried', async () => {
      const d = await evaluateToolEvent(input('slow_thing'), config, {
        timeoutMs: 150,
      });
      expect(d).toMatchObject({
        allowed: false,
        kind: 'error',
        viaFailMode: true,
      });
      expect(d.message).toMatch(/timed out after 150ms/);
      expect(mock.requests).toHaveLength(1);
    });

    test('timeout fails open when configured', async () => {
      const d = await evaluateToolEvent(input('slow_thing'), config, {
        timeoutMs: 150,
        failMode: 'open',
      });
      expect(d).toMatchObject({ allowed: true, kind: 'error' });
    });

    test('connection refused follows the fail mode', async () => {
      const dead = { ...config, endpoint: 'http://127.0.0.1:1/x' };
      const closed = await evaluateToolEvent(input('read_file'), dead);
      expect(closed).toMatchObject({ allowed: false, kind: 'error' });
      const open = await evaluateToolEvent(input('read_file'), dead, {
        failMode: 'open',
      });
      expect(open).toMatchObject({ allowed: true, kind: 'error' });
    });

    test('never throws, even if fetch itself throws', async () => {
      const d = await evaluateToolEvent(
        input('read_file'),
        config,
        {},
        {
          fetch: (() => {
            throw new Error('boom');
          }) as unknown as typeof fetch,
        }
      );
      expect(d).toMatchObject({ allowed: false, kind: 'error' });
    });
  });

  describe('request on the wire', () => {
    test('sends the bearer token and a JSON body, and never the token in the body', async () => {
      await evaluateToolEvent(
        input('read_file', { user: { id: 'u1', email: 'a@b.co' } }),
        config
      );
      const req = mock.requests[0];
      expect(req.headers.authorization).toBe(`Bearer ${mock.token}`);
      expect(req.headers['content-type']).toBe('application/json');
      expect(req.headers['user-agent']).toBe('acme_gw/1.0');
      expect(req.body).toMatchObject({
        client_platform: 'acme_gw',
        stage: 'PreToolUse',
        target_service: 'srv',
        user: { id: 'u1', email: 'a@b.co' },
      });
      expect(JSON.stringify(req.body)).not.toContain(mock.token);
    });
  });
});
