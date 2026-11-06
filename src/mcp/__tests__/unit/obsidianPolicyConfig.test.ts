import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  afterEach,
} from '@jest/globals';
import {
  evaluateToolEvent,
  failureDecision,
  getObsidianEnvConfig,
  loadObsidianEnvConfig,
  resetObsidianEnvConfigCache,
  ObsidianEnvConfig,
} from '../../services/obsidianPolicy';
import { MockObsidianServer } from '../MockObsidianServer';

describe('runtime extension configuration', () => {
  const base = { OBSIDIAN_GATEWAY_TOKEN: 'tok' };

  test('is absent unless configured', () => {
    expect(loadObsidianEnvConfig(base)).not.toHaveProperty('runtimeExtension');
  });

  test('is read when namespace and version are both set', () => {
    const cfg = loadObsidianEnvConfig({
      ...base,
      OBSIDIAN_RUNTIME_EXTENSION_NAMESPACE: 'acme.mcp_gateway',
      OBSIDIAN_RUNTIME_EXTENSION_VERSION: '2',
    });
    expect(cfg?.runtimeExtension).toEqual({
      namespace: 'acme.mcp_gateway',
      version: '2',
    });
  });

  test('requires namespace and version together', () => {
    expect(() =>
      loadObsidianEnvConfig({
        ...base,
        OBSIDIAN_RUNTIME_EXTENSION_NAMESPACE: 'acme.mcp_gateway',
      })
    ).toThrow(/set together/);
    expect(() =>
      loadObsidianEnvConfig({
        ...base,
        OBSIDIAN_RUNTIME_EXTENSION_VERSION: '1',
      })
    ).toThrow(/set together/);
  });

  test('rejects the reserved obsidian. namespace prefix', () => {
    expect(() =>
      loadObsidianEnvConfig({
        ...base,
        OBSIDIAN_RUNTIME_EXTENSION_NAMESPACE: 'obsidian.thing',
        OBSIDIAN_RUNTIME_EXTENSION_VERSION: '1',
      })
    ).toThrow(/reserved/);
  });
});

describe('getObsidianEnvConfig (cached, from process.env)', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
    resetObsidianEnvConfigCache();
  });

  test('is null when not configured, and caches that', () => {
    delete process.env.OBSIDIAN_GATEWAY_TOKEN;
    resetObsidianEnvConfigCache();
    expect(getObsidianEnvConfig()).toBeNull();
    // A later env change is not picked up until the cache is reset.
    process.env.OBSIDIAN_GATEWAY_TOKEN = 'tok';
    expect(getObsidianEnvConfig()).toBeNull();
    resetObsidianEnvConfigCache();
    expect(getObsidianEnvConfig()?.gatewayToken).toBe('tok');
  });

  test('an invalid config throws every time, never cached as "off"', () => {
    process.env.OBSIDIAN_GATEWAY_TOKEN = 'tok';
    process.env.OBSIDIAN_CLIENT_PLATFORM = 'mcp_gateway';
    resetObsidianEnvConfigCache();
    expect(() => getObsidianEnvConfig()).toThrow(/reserved/);
    expect(() => getObsidianEnvConfig()).toThrow(/reserved/);
  });
});

describe('failureDecision', () => {
  test('follows the fail mode and is marked as via fail mode', () => {
    expect(failureDecision('closed', 'error', 'x')).toMatchObject({
      allowed: false,
      viaFailMode: true,
      matchedPolicies: [],
    });
    expect(failureDecision('open', 'error', 'x').allowed).toBe(true);
  });
});

describe('runtime extension on the wire', () => {
  let mock: MockObsidianServer;
  let config: ObsidianEnvConfig;

  beforeAll(async () => {
    mock = new MockObsidianServer();
    config = {
      endpoint: await mock.start(),
      gatewayToken: mock.token,
      clientPlatform: 'acme_gw',
      timeoutMs: 2000,
      runtimeExtension: { namespace: 'acme.mcp_gateway', version: '1' },
    };
  });
  afterAll(async () => {
    await mock.stop();
  });

  const input = {
    stage: 'PreToolUse' as const,
    serverId: 'srv',
    toolName: 'read_file',
    sessionId: 's1',
  };

  test('combines the configured namespace/version with per-call data', async () => {
    mock.reset();
    await evaluateToolEvent(
      { ...input, runtimeData: { workspace_id: 'ws1' } },
      config
    );
    expect(mock.requests[0].body.runtime_extension).toEqual({
      namespace: 'acme.mcp_gateway',
      version: '1',
      data: { workspace_id: 'ws1' },
    });
  });

  test('an explicit runtimeExtension on the input wins', async () => {
    mock.reset();
    await evaluateToolEvent(
      {
        ...input,
        runtimeExtension: { namespace: 'other.ns', version: '9', data: {} },
      },
      config
    );
    expect(mock.requests[0].body.runtime_extension.namespace).toBe('other.ns');
  });

  test('nothing is sent when no extension is configured', async () => {
    mock.reset();
    const { runtimeExtension: _unused, ...noExt } = config;
    await evaluateToolEvent(
      { ...input, runtimeData: { workspace_id: 'ws1' } },
      noExt
    );
    expect(mock.requests[0].body).not.toHaveProperty('runtime_extension');
  });
});

describe('gateway token from a file', () => {
  test('reads the token from an absolute path, trimmed', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'obsidian-token-'));
    const file = path.join(dir, 'token');
    fs.writeFileSync(file, 'secret-from-file\n');
    try {
      expect(
        loadObsidianEnvConfig({ OBSIDIAN_GATEWAY_TOKEN: file })?.gatewayToken
      ).toBe('secret-from-file');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a literal token is used as-is', () => {
    expect(
      loadObsidianEnvConfig({ OBSIDIAN_GATEWAY_TOKEN: 'abc123' })?.gatewayToken
    ).toBe('abc123');
  });
});

describe('HTTP error detail', () => {
  const config: ObsidianEnvConfig = {
    endpoint: 'http://unused.invalid/x',
    gatewayToken: 't',
    clientPlatform: 'acme_gw',
    timeoutMs: 1000,
  };
  const input = {
    stage: 'PreToolUse' as const,
    serverId: 'srv',
    toolName: 'read_file',
    sessionId: 's1',
  };
  const respond = (body: BodyInit | null, status: number) =>
    (async () => new Response(body, { status })) as unknown as typeof fetch;

  test("includes Obsidian's error code so operators can diagnose a 4xx", async () => {
    const d = await evaluateToolEvent(
      input,
      config,
      {},
      {
        fetch: respond(
          JSON.stringify({ error: 'unregistered_runtime_extension' }),
          400
        ),
      }
    );
    expect(d.allowed).toBe(false);
    expect(d.message).toBe(
      'Obsidian returned HTTP 400 (unregistered_runtime_extension)'
    );
  });

  test('combines error and message without repeating them', async () => {
    const d = await evaluateToolEvent(
      input,
      config,
      {},
      {
        fetch: respond(
          JSON.stringify({
            error: 'invalid_request',
            message: 'event_id is required',
          }),
          400
        ),
      }
    );
    expect(d.message).toBe(
      'Obsidian returned HTTP 400 (invalid_request: event_id is required)'
    );
  });

  test('falls back to the bare status when the body is not JSON', async () => {
    const d = await evaluateToolEvent(
      input,
      config,
      {},
      {
        fetch: respond('<html>bad gateway</html>', 400),
      }
    );
    expect(d.message).toBe('Obsidian returned HTTP 400');
  });

  test('truncates an oversized error message', async () => {
    const d = await evaluateToolEvent(
      input,
      config,
      {},
      {
        fetch: respond(JSON.stringify({ message: 'x'.repeat(5000) }), 400),
      }
    );
    expect(d.message!.length).toBeLessThan(220);
  });
});
