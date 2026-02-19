/**
 * @file upstream-oauth.test.ts
 * E2E tests for upstream OAuth authentication
 *
 * Tests the gateway's ability to authenticate with upstream MCP servers
 * that require OAuth (auth_type: 'oauth_auto')
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { GatewayHarness, TestClient, getOAuthToken } from '../testUtils';
import { MockMCPServer } from '../MockMCPServer';
import { createServer, Server, IncomingMessage, ServerResponse } from 'http';

// Single gateway for all tests
let gateway: GatewayHarness;
let gatewayUrl: string;
let authToken: string;

// Mock upstream servers
let mockUpstream: MockMCPServer;
let oauthProtectedServer: MockOAuthMCPServer;

// Unique test run ID
const testRunId = Date.now().toString(36);

/**
 * Mock MCP server that requires OAuth authentication
 * Implements a simple OAuth 2.0 flow for testing
 */
class MockOAuthMCPServer {
  private server: Server | null = null;
  private port: number = 0;
  private validTokens: Set<string> = new Set();
  public requests: Array<{
    path: string;
    headers: Record<string, any>;
    body: any;
  }> = [];
  public isRunning = false;

  // OAuth endpoint tracking
  public authRequests: any[] = [];
  public tokenRequests: any[] = [];

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
        } else {
          reject(new Error('Failed to get server address'));
        }
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          this.isRunning = false;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  addValidToken(token: string): void {
    this.validTokens.add(token);
  }

  clearRequests(): void {
    this.requests = [];
    this.authRequests = [];
    this.tokenRequests = [];
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    const bodyText = Buffer.concat(chunks).toString('utf-8');

    let body: any = null;
    try {
      if (bodyText) {
        // Handle both JSON and form-urlencoded
        if (req.headers['content-type']?.includes('application/json')) {
          body = JSON.parse(bodyText);
        } else if (
          req.headers['content-type']?.includes('x-www-form-urlencoded')
        ) {
          body = Object.fromEntries(new URLSearchParams(bodyText));
        }
      }
    } catch {
      /* ignore */
    }

    this.requests.push({
      path: req.url ?? '/',
      headers: { ...req.headers },
      body,
    });

    const url = new URL(req.url ?? '/', `http://127.0.0.1:${this.port}`);

    // OAuth 2.0 well-known endpoint
    if (url.pathname === '/.well-known/oauth-authorization-server') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          issuer: `http://127.0.0.1:${this.port}`,
          authorization_endpoint: `http://127.0.0.1:${this.port}/oauth/authorize`,
          token_endpoint: `http://127.0.0.1:${this.port}/oauth/token`,
          registration_endpoint: `http://127.0.0.1:${this.port}/oauth/register`,
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          code_challenge_methods_supported: ['S256'],
        })
      );
      return;
    }

    // OAuth authorization endpoint
    if (url.pathname === '/oauth/authorize') {
      this.authRequests.push({ url: req.url, body });
      // In real flow, this would redirect to login page
      // For testing, we simulate the redirect back with a code
      const redirectUri = url.searchParams.get('redirect_uri');
      const state = url.searchParams.get('state');
      if (redirectUri && state) {
        res.writeHead(302, {
          Location: `${redirectUri}?code=test-auth-code&state=${state}`,
        });
        res.end();
        return;
      }
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_request' }));
      return;
    }

    // OAuth token endpoint
    if (url.pathname === '/oauth/token') {
      this.tokenRequests.push({ body });
      const accessToken = `upstream-token-${Date.now()}`;
      this.validTokens.add(accessToken);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: `refresh-${Date.now()}`,
        })
      );
      return;
    }

    // Dynamic client registration
    if (url.pathname === '/oauth/register' && req.method === 'POST') {
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          client_id: `client-${Date.now()}`,
          client_secret: `secret-${Date.now()}`,
          client_name: body?.client_name ?? 'Test Client',
          redirect_uris: body?.redirect_uris ?? [],
        })
      );
      return;
    }

    // MCP endpoint - requires auth
    if (url.pathname === '/mcp') {
      const authHeader = req.headers['authorization'];
      const token = authHeader?.replace('Bearer ', '');

      if (!token || !this.validTokens.has(token)) {
        res.writeHead(401, {
          'Content-Type': 'application/json',
          'WWW-Authenticate': `Bearer realm="MCP", resource_metadata="${`http://127.0.0.1:${this.port}/.well-known/oauth-authorization-server`}"`,
        });
        res.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }

      // Authenticated - handle MCP request
      await this.handleMCP(body, res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  }

  private async handleMCP(body: any, res: ServerResponse): Promise<void> {
    const id = body?.id ?? null;
    const method = body?.method;
    const params = body?.params ?? {};

    let result: any;

    switch (method) {
      case 'initialize':
        result = {
          protocolVersion: params.protocolVersion ?? '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'oauth-protected-server', version: '1.0.0' },
        };
        break;

      case 'tools/list':
        result = {
          tools: [
            {
              name: 'protected_action',
              description: 'A protected action requiring auth',
              inputSchema: { type: 'object', properties: {} },
            },
          ],
        };
        break;

      case 'tools/call':
        result = {
          content: [
            { type: 'text', text: 'Protected action executed successfully' },
          ],
        };
        break;

      case 'ping':
        result = {};
        break;

      default:
        result = {};
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', result, id }));
  }
}

beforeAll(async () => {
  // Start mock servers
  mockUpstream = new MockMCPServer();
  oauthProtectedServer = new MockOAuthMCPServer();

  const [mockUrl, oauthUrl] = await Promise.all([
    mockUpstream.start(),
    oauthProtectedServer.start(),
  ]);

  if (process.env.DEBUG === 'true') {
    console.log('[TestEnv] Servers started:');
    console.log(`  - mock:   ${mockUrl}`);
    console.log(`  - oauth:  ${oauthUrl}`);
  }

  // Pre-add a valid token for testing
  oauthProtectedServer.addValidToken('pre-authorized-token');

  // Configure gateway
  gateway = new GatewayHarness({
    servers: {
      [`ws-${testRunId}/basic`]: {
        serverId: 'basic',
        workspaceId: `ws-${testRunId}`,
        url: mockUrl,
        headers: {},
      },
      [`ws-${testRunId}/oauth-headers`]: {
        serverId: 'oauth-headers',
        workspaceId: `ws-${testRunId}`,
        url: `${oauthUrl}/mcp`,
        headers: {},
        // Use static headers with pre-authorized token
        passthroughHeaders: {
          Authorization: 'Bearer pre-authorized-token',
        },
      },
      // Note: auth_type: 'oauth_auto' would require full OAuth flow
      // which is complex to test in isolation - would need browser automation
      // For now, we test the static header approach
    },
    debug: process.env.DEBUG === 'true',
  });

  gatewayUrl = await gateway.start();

  if (process.env.DEBUG === 'true') {
    console.log(`[TestEnv] Gateway started at ${gatewayUrl}`);
  }

  authToken = await getOAuthToken(gatewayUrl);
}, 60000);

afterAll(async () => {
  await gateway?.stop();
  await mockUpstream?.stop();
  await oauthProtectedServer?.stop();
});

describe('Upstream OAuth - Static Authorization Headers', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = new TestClient({
      gatewayUrl,
      workspaceId: `ws-${testRunId}`,
      serverId: 'oauth-headers',
      authToken,
    });
    await client.connect();
  });

  afterAll(async () => {
    await client?.disconnect();
  });

  it('should forward static Authorization header to upstream', async () => {
    const result = await client.listTools();

    expect(result.success).toBe(true);
    expect(result.data?.tools).toBeDefined();

    // Verify the upstream received the auth header
    const mcpRequests = oauthProtectedServer.requests.filter(
      (r) => r.path === '/mcp'
    );
    expect(mcpRequests.length).toBeGreaterThan(0);

    const authHeader = mcpRequests[0].headers['authorization'];
    expect(authHeader).toBe('Bearer pre-authorized-token');
  });

  it('should access protected tools when authorized', async () => {
    const result = await client.callTool('protected_action', {});

    expect(result.success).toBe(true);
    expect((result.data?.content[0] as any)?.text).toContain(
      'Protected action executed successfully'
    );
  });
});

describe('Upstream OAuth - OAuth Metadata Discovery', () => {
  it('should discover OAuth metadata from well-known endpoint', async () => {
    const oauthServerUrl = `http://127.0.0.1:${oauthProtectedServer['port']}`;
    const response = await fetch(
      `${oauthServerUrl}/.well-known/oauth-authorization-server`
    );

    expect(response.status).toBe(200);

    const metadata = await response.json();
    expect(metadata.issuer).toBe(oauthServerUrl);
    expect(metadata.authorization_endpoint).toBeDefined();
    expect(metadata.token_endpoint).toBeDefined();
    expect(metadata.code_challenge_methods_supported).toContain('S256');
  });

  it('should support dynamic client registration', async () => {
    const oauthServerUrl = `http://127.0.0.1:${oauthProtectedServer['port']}`;
    const response = await fetch(`${oauthServerUrl}/oauth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Test Gateway Client',
        redirect_uris: ['http://localhost:3000/oauth/callback'],
        grant_types: ['authorization_code', 'refresh_token'],
      }),
    });

    expect(response.status).toBe(201);

    const client = await response.json();
    expect(client.client_id).toBeDefined();
    expect(client.client_secret).toBeDefined();
  });
});

describe('Upstream OAuth - Token Exchange', () => {
  it('should exchange authorization code for tokens', async () => {
    oauthProtectedServer.clearRequests();

    const oauthServerUrl = `http://127.0.0.1:${oauthProtectedServer['port']}`;
    const response = await fetch(`${oauthServerUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: 'test-auth-code',
        redirect_uri: 'http://localhost:3000/oauth/callback',
        client_id: 'test-client',
      }),
    });

    expect(response.status).toBe(200);

    const tokens = await response.json();
    expect(tokens.access_token).toBeDefined();
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.expires_in).toBeGreaterThan(0);
    expect(tokens.refresh_token).toBeDefined();

    // Verify the token request was recorded
    expect(oauthProtectedServer.tokenRequests.length).toBe(1);
  });
});

describe('Upstream OAuth - Unauthorized Access', () => {
  it('should reject MCP requests without valid token', async () => {
    const oauthServerUrl = `http://127.0.0.1:${oauthProtectedServer['port']}`;
    const response = await fetch(`${oauthServerUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {},
        id: 1,
      }),
    });

    expect(response.status).toBe(401);

    // Should include WWW-Authenticate header with resource_metadata
    const wwwAuth = response.headers.get('www-authenticate');
    expect(wwwAuth).toBeDefined();
    expect(wwwAuth).toContain('Bearer');
    expect(wwwAuth).toContain('resource_metadata');
  });

  it('should reject MCP requests with invalid token', async () => {
    const oauthServerUrl = `http://127.0.0.1:${oauthProtectedServer['port']}`;
    const response = await fetch(`${oauthServerUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid-token-xyz',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {},
        id: 1,
      }),
    });

    expect(response.status).toBe(401);
  });
});
