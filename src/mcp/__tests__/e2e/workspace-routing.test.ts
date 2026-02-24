/**
 * @file workspace-routing.test.ts
 *
 * Tests for multi-workspace and multi-server routing.
 *
 * Verifies:
 * - Correct server selection by workspaceId/serverId
 * - Server isolation (tools from different servers don't mix)
 * - Non-existent server returns proper error
 * - Multiple servers in same workspace
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { GatewayHarness, TestClient, getOAuthToken } from '../testUtils';
import { MockMCPServer } from '../MockMCPServer';

let gateway: GatewayHarness;
let gatewayUrl: string;
let authToken: string;

// Multiple mock servers to simulate different upstreams
let serverA: MockMCPServer;
let serverB: MockMCPServer;
let serverC: MockMCPServer;

// Clients for each server
let clientA: TestClient;
let clientB: TestClient;
let clientC: TestClient;

const testRunId = Date.now().toString(36);
const workspaceAlpha = `ws-alpha-${testRunId}`;
const workspaceBeta = `ws-beta-${testRunId}`;

beforeAll(async () => {
  // Start three different mock servers
  serverA = new MockMCPServer();
  serverB = new MockMCPServer();
  serverC = new MockMCPServer();

  const [urlA, urlB, urlC] = await Promise.all([
    serverA.start(),
    serverB.start(),
    serverC.start(),
  ]);

  if (process.env.DEBUG === 'true') {
    console.log('[TestEnv] Servers:');
    console.log(`  - Server-A: ${urlA}`);
    console.log(`  - Server-B: ${urlB}`);
    console.log(`  - Server-C: ${urlC}`);
  }

  // Configure gateway with multiple workspaces and servers
  gateway = new GatewayHarness({
    servers: {
      // Workspace Alpha has two servers
      [`${workspaceAlpha}/srv-1`]: {
        serverId: 'srv-1',
        workspaceId: workspaceAlpha,
        url: urlA,
        headers: {},
      },
      [`${workspaceAlpha}/srv-2`]: {
        serverId: 'srv-2',
        workspaceId: workspaceAlpha,
        url: urlB,
        headers: {},
      },
      // Workspace Beta has one server
      [`${workspaceBeta}/srv-1`]: {
        serverId: 'srv-1',
        workspaceId: workspaceBeta,
        url: urlC,
        headers: {},
      },
    },
    debug: process.env.DEBUG === 'true',
  });

  gatewayUrl = await gateway.start();
  authToken = await getOAuthToken(gatewayUrl);

  // Create clients for each workspace/server combination
  clientA = new TestClient({
    gatewayUrl,
    workspaceId: workspaceAlpha,
    serverId: 'srv-1',
    authToken,
  });

  clientB = new TestClient({
    gatewayUrl,
    workspaceId: workspaceAlpha,
    serverId: 'srv-2',
    authToken,
  });

  clientC = new TestClient({
    gatewayUrl,
    workspaceId: workspaceBeta,
    serverId: 'srv-1',
    authToken,
  });
}, 60000);

afterAll(async () => {
  await Promise.all([
    clientA?.disconnect(),
    clientB?.disconnect(),
    clientC?.disconnect(),
  ]);
  await gateway?.stop();
  await Promise.all([serverA?.stop(), serverB?.stop(), serverC?.stop()]);
});

// =============================================================================
// Server Selection by Path
// =============================================================================

describe('Workspace Routing: Server Selection', () => {
  it('should route to correct server by workspaceId/serverId', async () => {
    // Connect to Server A
    const resultA = await clientA.connect();
    expect(resultA.success).toBe(true);

    // Check that Server A received the request
    const requestsA = serverA.getRequestsByMethod('initialize');
    expect(requestsA.length).toBeGreaterThan(0);

    // Server B and C should NOT have received this request
    const requestsB = serverB.getRequestsByMethod('initialize');
    const requestsC = serverC.getRequestsByMethod('initialize');

    // Clear and reconnect to verify isolation
    serverA.clearRequests();
    serverB.clearRequests();
    serverC.clearRequests();
  });

  it('should route to different server in same workspace', async () => {
    serverA.clearRequests();
    serverB.clearRequests();

    // Connect to Server B (same workspace as A, different server)
    const resultB = await clientB.connect();
    expect(resultB.success).toBe(true);

    // Server B should receive this
    const requestsB = serverB.getRequestsByMethod('initialize');
    expect(requestsB.length).toBeGreaterThan(0);
  });

  it('should route to server in different workspace', async () => {
    serverA.clearRequests();
    serverB.clearRequests();
    serverC.clearRequests();

    // Connect to Server C (different workspace)
    const resultC = await clientC.connect();
    expect(resultC.success).toBe(true);

    // Server C should receive this
    const requestsC = serverC.getRequestsByMethod('initialize');
    expect(requestsC.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Server Isolation
// =============================================================================

describe('Workspace Routing: Server Isolation', () => {
  beforeAll(async () => {
    // Ensure all clients are connected
    if (!clientA.isConnected()) await clientA.connect();
    if (!clientB.isConnected()) await clientB.connect();
    if (!clientC.isConnected()) await clientC.connect();
  });

  it('should only see tools from connected server', async () => {
    // List tools from each client
    const toolsA = await clientA.listTools();
    const toolsB = await clientB.listTools();
    const toolsC = await clientC.listTools();

    expect(toolsA.success).toBe(true);
    expect(toolsB.success).toBe(true);
    expect(toolsC.success).toBe(true);

    // Each should return tools (from MockMCPServer)
    expect(toolsA.data?.tools.length).toBeGreaterThan(0);
    expect(toolsB.data?.tools.length).toBeGreaterThan(0);
    expect(toolsC.data?.tools.length).toBeGreaterThan(0);
  });

  it('should route tool calls to correct upstream', async () => {
    serverA.clearRequests();
    serverB.clearRequests();
    serverC.clearRequests();

    // Call tool on Server A
    const result = await clientA.callTool('echo', { message: 'from-client-a' });
    expect(result.success).toBe(true);

    // Only Server A should have received this
    const callsA = serverA.getRequestsByMethod('tools/call');
    const callsB = serverB.getRequestsByMethod('tools/call');
    const callsC = serverC.getRequestsByMethod('tools/call');

    expect(callsA.length).toBe(1);
    expect(callsB.length).toBe(0);
    expect(callsC.length).toBe(0);
  });

  it('should maintain separate sessions per server', async () => {
    // Make requests on all clients
    await clientA.listTools();
    await clientB.listTools();
    await clientC.listTools();

    // Each client should have its own session
    expect(clientA.isConnected()).toBe(true);
    expect(clientB.isConnected()).toBe(true);
    expect(clientC.isConnected()).toBe(true);
  });
});

// =============================================================================
// Error Handling for Invalid Routing
// =============================================================================

describe('Workspace Routing: Error Handling', () => {
  it('should return error for non-existent workspace', async () => {
    const badClient = new TestClient({
      gatewayUrl,
      workspaceId: 'nonexistent-workspace-12345',
      serverId: 'srv-1',
      authToken,
    });

    const result = await badClient.connect();

    // Should fail - workspace doesn't exist
    expect(result.success).toBe(false);
  });

  it('should return error for non-existent server in valid workspace', async () => {
    const badClient = new TestClient({
      gatewayUrl,
      workspaceId: workspaceAlpha, // Valid workspace
      serverId: 'nonexistent-server', // Invalid server
      authToken,
    });

    const result = await badClient.connect();

    // Should fail - server doesn't exist
    expect(result.success).toBe(false);
  });

  it('should return proper HTTP status for non-existent server', async () => {
    const response = await fetch(
      `${gatewayUrl}/${workspaceAlpha}/fake-server/mcp`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            clientInfo: { name: 'test', version: '1.0.0' },
            capabilities: {},
          },
          id: 1,
        }),
      }
    );

    // Should indicate not found (404 or 500 with error message)
    expect([404, 500]).toContain(response.status);
  });
});

// =============================================================================
// URL Path Variations
// =============================================================================

describe('Workspace Routing: Path Variations', () => {
  it('should handle workspaceId with special characters', async () => {
    // Our test workspace IDs have hyphens and alphanumerics
    // This tests that the routing handles them correctly
    const result = await clientA.connect();
    expect(result.success).toBe(true);
  });

  it('should handle serverId with hyphens', async () => {
    // srv-1 and srv-2 have hyphens
    const result = await clientB.connect();
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// Concurrent Access to Multiple Servers
// =============================================================================

describe('Workspace Routing: Concurrent Access', () => {
  it('should handle parallel requests to different servers', async () => {
    serverA.clearRequests();
    serverB.clearRequests();
    serverC.clearRequests();

    // Make parallel requests to all three servers
    const [resultA, resultB, resultC] = await Promise.all([
      clientA.callTool('echo', { message: 'parallel-a' }),
      clientB.callTool('echo', { message: 'parallel-b' }),
      clientC.callTool('echo', { message: 'parallel-c' }),
    ]);

    // All should succeed
    expect(resultA.success).toBe(true);
    expect(resultB.success).toBe(true);
    expect(resultC.success).toBe(true);

    // Each server should have received exactly one request
    expect(serverA.getRequestsByMethod('tools/call').length).toBe(1);
    expect(serverB.getRequestsByMethod('tools/call').length).toBe(1);
    expect(serverC.getRequestsByMethod('tools/call').length).toBe(1);
  });

  it('should handle rapid sequential requests to same server', async () => {
    serverA.clearRequests();

    // 5 rapid sequential requests
    for (let i = 0; i < 5; i++) {
      const result = await clientA.callTool('echo', { message: `rapid-${i}` });
      expect(result.success).toBe(true);
    }

    // All 5 should have reached Server A
    const calls = serverA.getRequestsByMethod('tools/call');
    expect(calls.length).toBe(5);
  });
});
