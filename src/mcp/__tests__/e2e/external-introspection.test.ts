/**
 * @file external-introspection.test.ts
 *
 * Tests for external token introspection (RFC 7662) via jwt_validation.introspectEndpoint.
 *
 * Verifies that tokens issued by an external IdP can be validated by the gateway
 * without a Portkey API key or control plane, using the server's configured
 * introspection endpoint.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { GatewayHarness, TestClient } from '../testUtils';
import { MockMCPServer } from '../MockMCPServer';

// ── Mock Introspection Server ────────────────────────────────────────────────

interface IntrospectionCall {
  token: string;
  timestamp: number;
  headers: Record<string, string | string[] | undefined>;
}

class MockIntrospectionServer {
  private server: Server | null = null;
  private port = 0;
  public calls: IntrospectionCall[] = [];
  public isRunning = false;

  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = createServer(this.handleRequest.bind(this));
      this.server.on('error', reject);
      this.server.listen(0, '127.0.0.1', () => {
        const address = this.server!.address();
        if (typeof address === 'object' && address) {
          this.port = address.port;
          this.isRunning = true;
          resolve(`http://127.0.0.1:${this.port}`);
        }
      });
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
      this.isRunning = false;
    }
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    if (req.method !== 'POST' || req.url !== '/introspect') {
      res.writeHead(404);
      res.end();
      return;
    }

    const body = await new Promise<string>((resolve) => {
      let data = '';
      req.on('data', (chunk: Buffer) => (data += chunk.toString()));
      req.on('end', () => resolve(data));
    });

    const contentType = req.headers['content-type'] || '';
    let token = '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      token = new URLSearchParams(body).get('token') || '';
    } else if (contentType.includes('application/json')) {
      try {
        token = JSON.parse(body).token || '';
      } catch {
        token = '';
      }
    }

    this.calls.push({
      token,
      timestamp: Date.now(),
      headers: req.headers as Record<string, string | string[] | undefined>,
    });

    // Tokens starting with "ext_valid_" are active
    if (token.startsWith('ext_valid_')) {
      const now = Math.floor(Date.now() / 1000);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          active: true,
          sub: 'external-user-42',
          client_id: 'external-client',
          username: 'external@example.com',
          email: 'external@example.com',
          scope: 'mcp:*',
          exp: now + 3600,
          iat: now,
          token_type: 'Bearer',
        })
      );
      return;
    }

    // Tokens starting with "ext_expired_" are expired
    if (token.startsWith('ext_expired_')) {
      const now = Math.floor(Date.now() / 1000);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          active: true,
          sub: 'external-user-42',
          exp: now - 100,
          iat: now - 3700,
        })
      );
      return;
    }

    // Everything else is inactive
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ active: false }));
  }
}

// ── Test Setup ───────────────────────────────────────────────────────────────

let gateway: GatewayHarness;
let gatewayUrl: string;
let mockUpstream: MockMCPServer;
let mockIntrospection: MockIntrospectionServer;
let mockUpstreamNoIntrospect: MockMCPServer;

const testRunId = Date.now().toString(36);
const workspaceId = `ext-intro-${testRunId}`;

beforeAll(async () => {
  mockUpstream = new MockMCPServer();
  mockUpstreamNoIntrospect = new MockMCPServer();
  mockIntrospection = new MockIntrospectionServer();

  const [upstreamUrl, noIntrospectUrl, introspectionUrl] = await Promise.all([
    mockUpstream.start(),
    mockUpstreamNoIntrospect.start(),
    mockIntrospection.start(),
  ]);

  gateway = new GatewayHarness({
    servers: {
      // Server with external introspection configured
      [`${workspaceId}/with-introspect`]: {
        serverId: 'with-introspect',
        workspaceId,
        url: upstreamUrl,
        headers: {},
        jwt_validation: {
          introspectEndpoint: `${introspectionUrl}/introspect`,
          introspectCacheMaxAge: 60,
        },
      },
      // Server without introspection (baseline)
      [`${workspaceId}/no-introspect`]: {
        serverId: 'no-introspect',
        workspaceId,
        url: noIntrospectUrl,
        headers: {},
      },
    },
    debug: process.env.DEBUG === 'true',
  });

  gatewayUrl = await gateway.start();
}, 60000);

afterAll(async () => {
  await gateway?.stop();
  await Promise.all([
    mockUpstream?.stop(),
    mockUpstreamNoIntrospect?.stop(),
    mockIntrospection?.stop(),
  ]);
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('External Token Introspection', () => {
  it('should accept a valid external token via introspection endpoint', async () => {
    const client = new TestClient({
      gatewayUrl,
      workspaceId,
      serverId: 'with-introspect',
      authToken: 'ext_valid_test_token',
    });

    const result = await client.connect();
    expect(result.success).toBe(true);
    expect(result.data?.serverInfo?.name).toBe('mock-mcp-server');

    await client.disconnect();
  });

  it('should call the configured introspection endpoint', async () => {
    const callsBefore = mockIntrospection.calls.length;

    const client = new TestClient({
      gatewayUrl,
      workspaceId,
      serverId: 'with-introspect',
      authToken: `ext_valid_unique_${Date.now()}`,
    });

    await client.connect();
    await client.disconnect();

    expect(mockIntrospection.calls.length).toBeGreaterThan(callsBefore);

    const lastCall =
      mockIntrospection.calls[mockIntrospection.calls.length - 1];
    expect(lastCall.token).toContain('ext_valid_unique_');
  });

  it('should reject an invalid external token', async () => {
    const client = new TestClient({
      gatewayUrl,
      workspaceId,
      serverId: 'with-introspect',
      authToken: 'ext_invalid_bad_token',
    });

    const result = await client.connect();
    expect(result.success).toBe(false);
  });

  it('should reject an expired external token', async () => {
    const client = new TestClient({
      gatewayUrl,
      workspaceId,
      serverId: 'with-introspect',
      authToken: 'ext_expired_token_123',
    });

    const result = await client.connect();
    expect(result.success).toBe(false);
  });

  it('should reject external token on server without introspection configured', async () => {
    const client = new TestClient({
      gatewayUrl,
      workspaceId,
      serverId: 'no-introspect',
      authToken: 'ext_valid_should_fail',
    });

    const result = await client.connect();
    expect(result.success).toBe(false);
  });

  it('should cache validated tokens to avoid repeated introspection calls', async () => {
    const token = `ext_valid_cache_test_${Date.now()}`;

    // First request — should call introspection
    const client1 = new TestClient({
      gatewayUrl,
      workspaceId,
      serverId: 'with-introspect',
      authToken: token,
    });

    const result1 = await client1.connect();
    expect(result1.success).toBe(true);
    await client1.disconnect();

    const callsAfterFirst = mockIntrospection.calls.filter(
      (c) => c.token === token
    ).length;
    expect(callsAfterFirst).toBe(1);

    // Second request with same token — should hit cache
    const client2 = new TestClient({
      gatewayUrl,
      workspaceId,
      serverId: 'with-introspect',
      authToken: token,
    });

    const result2 = await client2.connect();
    expect(result2.success).toBe(true);
    await client2.disconnect();

    const callsAfterSecond = mockIntrospection.calls.filter(
      (c) => c.token === token
    ).length;
    // Should still be 1 — second request used the cached result
    expect(callsAfterSecond).toBe(1);
  });

  it('should not break gateway OAuth registration', async () => {
    const regResponse = await fetch(`${gatewayUrl}/oauth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'ext-intro-compat-test',
        redirect_uris: ['http://localhost:1234/callback'],
        grant_types: ['authorization_code'],
        token_endpoint_auth_method: 'none',
      }),
    });
    expect(regResponse.status).toBe(201);
    const body = await regResponse.json();
    expect(body.client_id).toBeDefined();
  });

  it('should list tools after external token authentication', async () => {
    const client = new TestClient({
      gatewayUrl,
      workspaceId,
      serverId: 'with-introspect',
      authToken: `ext_valid_tools_${Date.now()}`,
    });

    const connectResult = await client.connect();
    expect(connectResult.success).toBe(true);

    const toolsResult = await client.listTools();
    expect(toolsResult.success).toBe(true);
    expect(toolsResult.data).toBeDefined();
    expect(toolsResult.data!.tools.length).toBeGreaterThan(0);

    await client.disconnect();
  });

  it('should call tools after external token authentication', async () => {
    const client = new TestClient({
      gatewayUrl,
      workspaceId,
      serverId: 'with-introspect',
      authToken: `ext_valid_call_${Date.now()}`,
    });

    const connectResult = await client.connect();
    expect(connectResult.success).toBe(true);

    const callResult = await client.callTool('echo', { message: 'hello' });
    expect(callResult.success).toBe(true);

    await client.disconnect();
  });
});
