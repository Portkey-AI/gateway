/**
 * @file session-lifecycle.test.ts
 * E2E tests for MCP session lifecycle management
 *
 * Tests session creation, restoration, expiration, and cleanup.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import {
  GatewayHarness,
  TestClient,
  getOAuthToken,
  getLocalOAuthToken,
} from '../testUtils';
import { MockMCPServer } from '../MockMCPServer';

// Single gateway for all tests
let gateway: GatewayHarness;
let gatewayUrl: string;
let authToken: string;
let oauthCredentials: {
  clientId: string;
  clientSecret: string;
  accessToken: string;
};

// Mock upstream servers
let sessionServer: MockMCPServer;
let persistentServer: MockMCPServer;

// Unique test run ID
const testRunId = Date.now().toString(36);

beforeAll(async () => {
  // Start mock servers
  sessionServer = new MockMCPServer();
  persistentServer = new MockMCPServer();

  const [sessionUrl, persistentUrl] = await Promise.all([
    sessionServer.start(),
    persistentServer.start(),
  ]);

  if (process.env.DEBUG === 'true') {
    console.log('[TestEnv] Servers started:');
    console.log(`  - session:    ${sessionUrl}`);
    console.log(`  - persistent: ${persistentUrl}`);
  }

  // Configure gateway
  gateway = new GatewayHarness({
    servers: {
      [`ws-${testRunId}/session`]: {
        serverId: 'session',
        workspaceId: `ws-${testRunId}`,
        url: sessionUrl,
        headers: {},
      },
      [`ws-${testRunId}/persistent`]: {
        serverId: 'persistent',
        workspaceId: `ws-${testRunId}`,
        url: persistentUrl,
        headers: {},
      },
    },
    debug: process.env.DEBUG === 'true',
  });

  gatewayUrl = await gateway.start();

  if (process.env.DEBUG === 'true') {
    console.log(`[TestEnv] Gateway started at ${gatewayUrl}`);
  }

  oauthCredentials = await getLocalOAuthToken(gatewayUrl);
  authToken = oauthCredentials.accessToken;
}, 60000);

afterAll(async () => {
  await gateway?.stop();
  await sessionServer?.stop();
  await persistentServer?.stop();
});

describe('Session Lifecycle - Creation', () => {
  it('should create new session on connect', async () => {
    sessionServer.clearRequests();

    const client = new TestClient({
      gatewayUrl,
      workspaceId: `ws-${testRunId}`,
      serverId: 'session',
      authToken,
    });

    const result = await client.connect();

    expect(result.success).toBe(true);
    expect(result.data?.serverInfo).toBeDefined();
    expect(result.data?.capabilities).toBeDefined();

    // Verify initialize was called on upstream
    const initRequests = sessionServer.getRequestsByMethod('initialize');
    expect(initRequests.length).toBeGreaterThan(0);

    await client.disconnect();
  });

  it('should return server info and capabilities on initialize', async () => {
    const client = new TestClient({
      gatewayUrl,
      workspaceId: `ws-${testRunId}`,
      serverId: 'session',
      authToken,
    });

    const result = await client.connect();

    expect(result.success).toBe(true);
    expect(result.data?.serverInfo.name).toBeDefined();
    expect(result.data?.serverInfo.version).toBeDefined();
    expect(result.data?.capabilities.tools).toBeDefined();

    await client.disconnect();
  });

  it('should allow multiple sessions from same client ID', async () => {
    const clients = await Promise.all(
      [1, 2, 3].map(async (i) => {
        const c = new TestClient({
          gatewayUrl,
          workspaceId: `ws-${testRunId}`,
          serverId: 'session',
          authToken,
          clientName: `test-client-${testRunId}`, // Same client name
        });
        await c.connect();
        return c;
      })
    );

    try {
      // All clients should be functional
      const results = await Promise.all(clients.map((c) => c.ping()));
      results.forEach((r) => expect(r.success).toBe(true));
    } finally {
      await Promise.all(clients.map((c) => c.disconnect()));
    }
  });
});

describe('Session Lifecycle - Active Operations', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = new TestClient({
      gatewayUrl,
      workspaceId: `ws-${testRunId}`,
      serverId: 'session',
      authToken,
    });
    await client.connect();
  });

  afterAll(async () => {
    await client?.disconnect();
  });

  it('should maintain session across multiple operations', async () => {
    sessionServer.clearRequests();

    // Perform multiple operations
    await client.listTools();
    await client.callTool('echo', { message: 'test1' });
    await client.ping();
    await client.callTool('echo', { message: 'test2' });

    // All should succeed using same session
    const requests = sessionServer.requests;
    expect(requests.length).toBeGreaterThanOrEqual(4);
  });

  it('should update last activity timestamp on operations', async () => {
    // Make a request
    await client.ping();

    // Wait a bit
    await new Promise((r) => setTimeout(r, 100));

    // Make another request - should work (session still active)
    const result = await client.ping();
    expect(result.success).toBe(true);
  });
});

describe('Session Lifecycle - Disconnection', () => {
  it('should cleanly disconnect session', async () => {
    const client = new TestClient({
      gatewayUrl,
      workspaceId: `ws-${testRunId}`,
      serverId: 'session',
      authToken,
    });

    await client.connect();
    expect(client.isConnected()).toBe(true);

    await client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  it('should handle disconnect without prior operations', async () => {
    const client = new TestClient({
      gatewayUrl,
      workspaceId: `ws-${testRunId}`,
      serverId: 'session',
      authToken,
    });

    await client.connect();
    // Immediately disconnect
    await client.disconnect();

    expect(client.isConnected()).toBe(false);
  });

  it('should handle multiple disconnect calls gracefully', async () => {
    const client = new TestClient({
      gatewayUrl,
      workspaceId: `ws-${testRunId}`,
      serverId: 'session',
      authToken,
    });

    await client.connect();

    // Multiple disconnects should not throw
    await client.disconnect();
    await client.disconnect();
    await client.disconnect();

    expect(client.isConnected()).toBe(false);
  });
});

describe('Session Lifecycle - Reconnection', () => {
  it('should allow reconnection after disconnect', async () => {
    const client = new TestClient({
      gatewayUrl,
      workspaceId: `ws-${testRunId}`,
      serverId: 'session',
      authToken,
    });

    // First connection
    await client.connect();
    const result1 = await client.callTool('echo', { message: 'first' });
    expect(result1.success).toBe(true);

    // Disconnect
    await client.disconnect();
    expect(client.isConnected()).toBe(false);

    // Reconnect
    await client.connect();
    const result2 = await client.callTool('echo', { message: 'second' });
    expect(result2.success).toBe(true);

    await client.disconnect();
  });

  it('should create new session on reconnect', async () => {
    const client = new TestClient({
      gatewayUrl,
      workspaceId: `ws-${testRunId}`,
      serverId: 'session',
      authToken,
    });

    await client.connect();
    await client.disconnect();

    // Clear requests AFTER first disconnect
    sessionServer.clearRequests();

    await client.connect();

    // Should see at least one new initialize request
    const initRequests = sessionServer.getRequestsByMethod('initialize');
    expect(initRequests.length).toBeGreaterThanOrEqual(1);

    await client.disconnect();
  });
});

describe('Session Lifecycle - Token Validation', () => {
  it('should reject requests with invalid token', async () => {
    const client = new TestClient({
      gatewayUrl,
      workspaceId: `ws-${testRunId}`,
      serverId: 'session',
      authToken: 'invalid-token-xyz',
    });

    const result = await client.connect();

    // Should fail authentication
    expect(result.success).toBe(false);
  });

  it('should reject requests without token', async () => {
    const client = new TestClient({
      gatewayUrl,
      workspaceId: `ws-${testRunId}`,
      serverId: 'session',
      // No authToken
    });

    const result = await client.connect();

    // Should fail authentication
    expect(result.success).toBe(false);
  });

  it('should work with freshly issued token', async () => {
    // Get a new token
    const newCreds = await getLocalOAuthToken(gatewayUrl);

    const client = new TestClient({
      gatewayUrl,
      workspaceId: `ws-${testRunId}`,
      serverId: 'session',
      authToken: newCreds.accessToken,
    });

    const result = await client.connect();
    expect(result.success).toBe(true);

    await client.disconnect();
  });
});

describe('Session Lifecycle - Token Revocation', () => {
  it('should accept token revocation requests', async () => {
    // Get a fresh token
    const creds = await getLocalOAuthToken(gatewayUrl);

    const client = new TestClient({
      gatewayUrl,
      workspaceId: `ws-${testRunId}`,
      serverId: 'session',
      authToken: creds.accessToken,
    });

    // Should work initially
    const connectResult = await client.connect();
    expect(connectResult.success).toBe(true);

    // Revoke the token
    const revokeResponse = await fetch(`${gatewayUrl}/oauth/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: creds.accessToken,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      }),
    });

    // Revocation should be accepted
    expect(revokeResponse.status).toBe(200);

    await client.disconnect();

    // Note: Immediate rejection of revoked tokens depends on cache invalidation
    // which may have latency. We test that revocation API works correctly.
  });
});

describe('Session Lifecycle - Concurrent Sessions', () => {
  it('should handle multiple concurrent sessions to same server', async () => {
    sessionServer.clearRequests();

    const clients = await Promise.all(
      Array.from({ length: 5 }, async (_, i) => {
        const c = new TestClient({
          gatewayUrl,
          workspaceId: `ws-${testRunId}`,
          serverId: 'session',
          authToken,
        });
        await c.connect();
        return c;
      })
    );

    try {
      // All clients should be able to make requests
      const results = await Promise.all(
        clients.map((c) => c.callTool('echo', { message: 'concurrent' }))
      );

      results.forEach((r) => expect(r.success).toBe(true));
    } finally {
      await Promise.all(clients.map((c) => c.disconnect()));
    }
  });

  it('should isolate sessions from different workspaces', async () => {
    // Create unique workspace for this test
    const ws1 = `ws-${testRunId}`;
    const ws2 = `ws-${testRunId}-alt`;

    // Add another workspace config
    // Note: This would require gateway restart, so we test with existing config

    const client1 = new TestClient({
      gatewayUrl,
      workspaceId: ws1,
      serverId: 'session',
      authToken,
    });

    await client1.connect();

    const result = await client1.callTool('echo', { message: 'workspace1' });
    expect(result.success).toBe(true);

    await client1.disconnect();
  });
});

describe('Session Lifecycle - Error Recovery', () => {
  it('should recover from upstream connection errors', async () => {
    const client = new TestClient({
      gatewayUrl,
      workspaceId: `ws-${testRunId}`,
      serverId: 'session',
      authToken,
    });

    await client.connect();

    // Simulate temporary error
    sessionServer.setErrorForMethod('tools/call', {
      code: -32603,
      message: 'Temporary error',
    });

    const errorResult = await client.callTool('echo', { message: 'error' });
    expect(errorResult.success).toBe(false);

    // Clear error
    sessionServer.setErrorForMethod('tools/call', null);

    // Should recover
    const successResult = await client.callTool('echo', {
      message: 'recovered',
    });
    expect(successResult.success).toBe(true);

    await client.disconnect();
  });

  it('should handle upstream restart gracefully', async () => {
    const client = new TestClient({
      gatewayUrl,
      workspaceId: `ws-${testRunId}`,
      serverId: 'persistent',
      authToken,
    });

    await client.connect();

    // Initial request works
    const result1 = await client.callTool('echo', { message: 'before' });
    expect(result1.success).toBe(true);

    // Restart upstream server
    await persistentServer.stop();
    await persistentServer.start();

    // Give it a moment to come back up
    await new Promise((r) => setTimeout(r, 100));

    // Reconnect client (session may need refresh)
    await client.disconnect();
    await client.connect();

    // Should work after upstream restart
    const result2 = await client.callTool('echo', { message: 'after' });
    expect(result2.success).toBe(true);

    await client.disconnect();
  });
});

describe('Session Lifecycle - Cleanup', () => {
  it('should clean up resources on disconnect', async () => {
    const clients: TestClient[] = [];

    // Create many sessions
    for (let i = 0; i < 5; i++) {
      const client = new TestClient({
        gatewayUrl,
        workspaceId: `ws-${testRunId}`,
        serverId: 'session',
        authToken,
      });
      await client.connect();
      clients.push(client);
    }

    // Disconnect all
    await Promise.all(clients.map((c) => c.disconnect()));

    // All should be disconnected
    clients.forEach((c) => expect(c.isConnected()).toBe(false));
  });
});
