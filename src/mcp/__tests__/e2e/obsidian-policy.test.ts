/**
 * @file obsidian-policy.test.ts
 *
 * End-to-end tests for the Obsidian policy integration: a real gateway process,
 * a mock upstream MCP server, and a mock Obsidian evaluation endpoint.
 *
 * Verifies:
 * - Disabled servers behave exactly as before and never call Obsidian
 * - PreToolUse: allow / warn / block (block never reaches the upstream)
 * - PostToolUse: a blocked result is withheld from the client
 * - Fail-closed vs fail-open when Obsidian cannot answer or does not evaluate
 * - What the gateway actually sends to Obsidian (stage, identity, session, result)
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from '@jest/globals';
import { GatewayHarness, TestClient, getOAuthToken } from '../testUtils';
import { MockMCPServer } from '../MockMCPServer';
import { MockObsidianServer } from '../MockObsidianServer';

const POLICY_DENIED = -32003;

let gateway: GatewayHarness;
let upstream: MockMCPServer;
let obsidian: MockObsidianServer;

let enforce: TestClient; // fail-closed (default), both stages
let failOpen: TestClient; // fail-open, both stages
let preOnly: TestClient; // PreToolUse only
let off: TestClient; // no policy block at all

const testRunId = Date.now().toString(36);
const workspaceId = `obsidian-${testRunId}`;

const toolCalls = () => upstream.getRequestsByMethod('tools/call');
const stagesSeen = () => obsidian.requests.map((r) => r.body?.stage);

beforeAll(async () => {
  upstream = new MockMCPServer();
  const upstreamUrl = await upstream.start();
  // Extra tools so the mock Obsidian can pick a verdict from the name prefix.
  upstream.setTools([
    ...['echo', 'blocked_tool', 'warn_tool', 'noeval_tool', 'slow_tool'].map(
      (name) => ({
        name,
        description: name,
        inputSchema: { type: 'object', properties: {} },
      })
    ),
  ]);

  obsidian = new MockObsidianServer({ slowMs: 2500 });
  const obsidianUrl = await obsidian.start();

  const server = (id: string, policy?: object) => ({
    [`${workspaceId}/${id}`]: {
      serverId: id,
      workspaceId,
      url: upstreamUrl,
      headers: {},
      ...(policy ? { policy } : {}),
    },
  });

  gateway = new GatewayHarness({
    servers: {
      ...server('enforce', { obsidian: { enabled: true } }),
      ...server('open', { obsidian: { enabled: true, failMode: 'open' } }),
      ...server('preonly', {
        obsidian: { enabled: true, stages: ['PreToolUse'] },
      }),
      ...server('off'),
    },
    env: {
      OBSIDIAN_GATEWAY_TOKEN: obsidian.token,
      OBSIDIAN_ENDPOINT: obsidianUrl,
      OBSIDIAN_CLIENT_PLATFORM: 'e2e_gateway',
      OBSIDIAN_TIMEOUT_MS: '1000',
      OBSIDIAN_RUNTIME_EXTENSION_NAMESPACE: 'e2e.mcp_gateway',
      OBSIDIAN_RUNTIME_EXTENSION_VERSION: '1',
    },
    debug: process.env.DEBUG === 'true',
  });
  const gatewayUrl = await gateway.start();
  const authToken = await getOAuthToken(gatewayUrl);

  const make = (serverId: string) =>
    new TestClient({ gatewayUrl, workspaceId, serverId, authToken });
  enforce = make('enforce');
  failOpen = make('open');
  preOnly = make('preonly');
  off = make('off');
  for (const c of [enforce, failOpen, preOnly, off]) {
    const r = await c.connect();
    if (!r.success) throw new Error(`connect failed: ${r.error?.message}`);
  }
}, 90000);

afterAll(async () => {
  await Promise.all(
    [enforce, failOpen, preOnly, off].map((c) => c?.disconnect())
  );
  await gateway?.stop();
  await upstream?.stop();
  await obsidian?.stop();
});

beforeEach(() => {
  obsidian.reset();
  obsidian.forceStatus = undefined;
  upstream.clearRequests();
});

describe('policy disabled', () => {
  it('runs the tool and never calls Obsidian', async () => {
    const r = await off.callTool('echo', { message: 'hi' });
    expect(r.success).toBe(true);
    expect(r.data?.content[0].text).toBe('Echo: hi');
    expect(obsidian.requests).toHaveLength(0);
  });
});

describe('PreToolUse', () => {
  it('allows a passing call and evaluates both stages', async () => {
    const r = await enforce.callTool('echo', { message: 'hi' });
    expect(r.success).toBe(true);
    expect(r.data?.content[0].text).toBe('Echo: hi');
    expect(stagesSeen()).toEqual(['PreToolUse', 'PostToolUse']);
    expect(toolCalls()).toHaveLength(1);
  });

  it('blocks a denied call with the policy message and never reaches the upstream', async () => {
    const r = await enforce.callTool('blocked_tool', {});
    expect(r.success).toBe(false);
    expect(r.error?.code).toBe(POLICY_DENIED);
    expect(r.error?.message).toContain('Tool blocked by test policy');
    expect(toolCalls()).toHaveLength(0);
    // Denied before running, so there is no PostToolUse evaluation.
    expect(stagesSeen()).toEqual(['PreToolUse']);
  });

  it('lets a warn through (the match is Obsidian-side only)', async () => {
    const r = await enforce.callTool('warn_tool', {});
    expect(r.success).toBe(true);
    expect(toolCalls()).toHaveLength(1);
  });

  it('only evaluates PreToolUse when stages is restricted', async () => {
    const r = await preOnly.callTool('echo', { message: 'hi' });
    expect(r.success).toBe(true);
    expect(stagesSeen()).toEqual(['PreToolUse']);
  });
});

describe('PostToolUse', () => {
  it('withholds a blocked result from the client', async () => {
    const r = await enforce.callTool('echo', { message: 'the SECRET key' });
    expect(r.success).toBe(false);
    expect(r.error?.code).toBe(POLICY_DENIED);
    expect(r.error?.message).toContain('Sensitive data in tool output');
    // The tool did run upstream; only its output was withheld.
    expect(toolCalls()).toHaveLength(1);
    expect(stagesSeen()).toEqual(['PreToolUse', 'PostToolUse']);
    // The sensitive text must not leak back to the client in the error.
    expect(JSON.stringify(r)).not.toContain('the SECRET key');
  });
});

describe('what the gateway sends to Obsidian', () => {
  it('sends stage, session, target service, tool, args and identity', async () => {
    await enforce.callTool('echo', { message: 'hello' });
    const [pre, post] = obsidian.requests.map((r) => r.body);

    expect(pre).toMatchObject({
      version: '1.0',
      client_platform: 'e2e_gateway',
      stage: 'PreToolUse',
      target_service: 'enforce',
      action_param: { tool_name: 'echo', args: { message: 'hello' } },
    });
    expect(pre.session_id).toBeTruthy();
    expect(pre.event_id).toBeTruthy();
    expect(pre.agent?.id).toBeTruthy(); // OAuth client id
    expect(pre.action_param).not.toHaveProperty('tool_response');

    // Same session, new event, result attached.
    expect(post.stage).toBe('PostToolUse');
    expect(post.session_id).toBe(pre.session_id);
    expect(post.event_id).not.toBe(pre.event_id);
    expect(post.action_param.tool_response.content[0].text).toBe('Echo: hello');
  });

  it('attaches the configured runtime extension with gateway context', async () => {
    await enforce.callTool('echo', { message: 'x' });
    expect(obsidian.requests[0].body.runtime_extension).toEqual({
      namespace: 'e2e.mcp_gateway',
      version: '1',
      data: expect.objectContaining({
        workspace_id: workspaceId,
        server_id: 'enforce',
      }),
    });
  });

  it('authenticates with the gateway token, which never appears in the body', async () => {
    await enforce.callTool('echo', { message: 'x' });
    const req = obsidian.requests[0];
    expect(req.headers.authorization).toBe(`Bearer ${obsidian.token}`);
    expect(JSON.stringify(req.body)).not.toContain(obsidian.token);
  });
});

describe('when Obsidian does not evaluate (pass without evaluation_id)', () => {
  it('fail-closed: blocks, and says the check was unavailable', async () => {
    const r = await enforce.callTool('noeval_tool', {});
    expect(r.success).toBe(false);
    expect(r.error?.code).toBe(POLICY_DENIED);
    expect(r.error?.message).toMatch(/fail-closed/);
    expect(toolCalls()).toHaveLength(0);
  });

  it('fail-open: allows the call', async () => {
    const r = await failOpen.callTool('noeval_tool', {});
    expect(r.success).toBe(true);
    expect(toolCalls()).toHaveLength(1);
  });
});

describe('when Obsidian is down', () => {
  it('fail-closed: blocks and never reaches the upstream', async () => {
    obsidian.forceStatus = 503;
    const r = await enforce.callTool('echo', { message: 'hi' });
    expect(r.success).toBe(false);
    expect(r.error?.code).toBe(POLICY_DENIED);
    expect(r.error?.message).toMatch(/fail-closed/);
    expect(toolCalls()).toHaveLength(0);
  });

  it('fail-open: the tool runs', async () => {
    obsidian.forceStatus = 503;
    const r = await failOpen.callTool('echo', { message: 'hi' });
    expect(r.success).toBe(true);
    expect(r.data?.content[0].text).toBe('Echo: hi');
    expect(toolCalls()).toHaveLength(1);
  });

  it('fail-closed on a timeout (does not hang the call)', async () => {
    const started = Date.now();
    const r = await enforce.callTool('slow_tool', {});
    expect(r.success).toBe(false);
    expect(r.error?.message).toMatch(/timed out/);
    expect(toolCalls()).toHaveLength(0);
    // Gateway timeout is 1000ms; the mock would have taken 2500ms.
    expect(Date.now() - started).toBeLessThan(2400);
  });
});

describe('a blocked call does not break the session', () => {
  it('allows later calls on the same session', async () => {
    const blocked = await enforce.callTool('blocked_tool', {});
    expect(blocked.success).toBe(false);
    const ok = await enforce.callTool('echo', { message: 'after' });
    expect(ok.success).toBe(true);
    expect(ok.data?.content[0].text).toBe('Echo: after');
  });
});
