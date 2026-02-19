/**
 * @file connectivity.test.ts
 * E2E tests for MCP gateway connectivity
 *
 * Uses a SINGLE gateway with MULTIPLE upstream servers configured.
 * Each test suite connects to a different workspaceId/serverId.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { GatewayHarness, TestClient, getOAuthToken } from '../testUtils';
import { MockMCPServer } from '../MockMCPServer';

// Single gateway for all tests
let gateway: GatewayHarness;
let gatewayUrl: string;
let authToken: string;

// Multiple upstream servers
let basicServer: MockMCPServer;
let headerServer: MockMCPServer;
let errorServer: MockMCPServer;
let policyServer: MockMCPServer;

// Clients for each test suite
let basicClient: TestClient;
let headerClient: TestClient;
let errorClient: TestClient;
let policyClient: TestClient;

// Use unique test run ID to avoid Redis cache conflicts
const testRunId = Date.now().toString(36);

beforeAll(async () => {
  // Start all upstream servers
  basicServer = new MockMCPServer();
  headerServer = new MockMCPServer();
  errorServer = new MockMCPServer();
  policyServer = new MockMCPServer();

  const [basicUrl, headerUrl, errorUrl, policyUrl] = await Promise.all([
    basicServer.start(),
    headerServer.start(),
    errorServer.start(),
    policyServer.start(),
  ]);

  if (process.env.DEBUG === 'true') {
    console.log('[TestEnv] Upstream servers started:');
    console.log(`  - basic:  ${basicUrl}`);
    console.log(`  - header: ${headerUrl}`);
    console.log(`  - error:  ${errorUrl}`);
    console.log(`  - policy: ${policyUrl}`);
  }

  // Configure single gateway with all servers
  // Use testRunId in IDs to avoid Redis cache conflicts between test runs
  gateway = new GatewayHarness({
    servers: {
      [`ws-${testRunId}/basic`]: {
        serverId: 'basic',
        workspaceId: `ws-${testRunId}`,
        url: basicUrl,
        headers: {},
      },
      [`ws-${testRunId}/header`]: {
        serverId: 'header',
        workspaceId: `ws-${testRunId}`,
        url: headerUrl,
        headers: {},
        forwardHeaders: ['x-custom-header', 'x-trace-id'],
        passthroughHeaders: {
          'x-gateway-id': 'test-gateway',
        },
      },
      [`ws-${testRunId}/error`]: {
        serverId: 'error',
        workspaceId: `ws-${testRunId}`,
        url: errorUrl,
        headers: {},
      },
      [`ws-${testRunId}/policy`]: {
        serverId: 'policy',
        workspaceId: `ws-${testRunId}`,
        url: policyUrl,
        headers: {},
        tools: {
          allowed: ['echo'],
          blocked: ['fail'],
        },
      },
    },
    debug: process.env.DEBUG === 'true',
  });

  gatewayUrl = await gateway.start();

  if (process.env.DEBUG === 'true') {
    console.log(`[TestEnv] Gateway started at ${gatewayUrl}`);
  }

  // Get OAuth token
  authToken = await getOAuthToken(gatewayUrl);

  if (process.env.DEBUG === 'true') {
    console.log(`[TestEnv] Got OAuth token: ${authToken.substring(0, 20)}...`);
  }

  // Create clients for each server (using testRunId for unique paths)
  basicClient = new TestClient({
    gatewayUrl,
    workspaceId: `ws-${testRunId}`,
    serverId: 'basic',
    authToken,
  });

  headerClient = new TestClient({
    gatewayUrl,
    workspaceId: `ws-${testRunId}`,
    serverId: 'header',
    authToken,
  });

  errorClient = new TestClient({
    gatewayUrl,
    workspaceId: `ws-${testRunId}`,
    serverId: 'error',
    authToken,
  });

  policyClient = new TestClient({
    gatewayUrl,
    workspaceId: `ws-${testRunId}`,
    serverId: 'policy',
    authToken,
  });
}, 60000);

afterAll(async () => {
  // Disconnect all clients
  await Promise.all([
    basicClient?.disconnect(),
    headerClient?.disconnect(),
    errorClient?.disconnect(),
    policyClient?.disconnect(),
  ]);

  // Stop gateway
  await gateway?.stop();

  // Stop all upstream servers
  await Promise.all([
    basicServer?.stop(),
    headerServer?.stop(),
    errorServer?.stop(),
    policyServer?.stop(),
  ]);
});

describe('MCP Gateway E2E - Basic Connectivity', () => {
  describe('Gateway Health', () => {
    it('should respond to health check', async () => {
      const response = await fetch(`${gatewayUrl}/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
    });

    it('should return gateway info at root', async () => {
      const response = await fetch(`${gatewayUrl}/`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.gateway).toBe('Portkey MCP Gateway');
    });
  });

  describe('MCP Initialization', () => {
    it('should connect and initialize MCP session', async () => {
      const result = await basicClient.connect();

      expect(result.success).toBe(true);
      expect(result.data?.serverInfo).toBeDefined();
      expect(result.data?.capabilities).toBeDefined();
    });

    it('should respond to ping after initialization', async () => {
      if (!basicClient.isConnected()) {
        await basicClient.connect();
      }

      const result = await basicClient.ping();
      expect(result.success).toBe(true);
    });
  });

  describe('Tool Operations', () => {
    beforeAll(async () => {
      if (!basicClient.isConnected()) {
        await basicClient.connect();
      }
    });

    it('should list available tools', async () => {
      const result = await basicClient.listTools();

      expect(result.success).toBe(true);
      expect(result.data?.tools).toBeDefined();
      expect(Array.isArray(result.data?.tools)).toBe(true);
      expect(result.data?.tools.length).toBeGreaterThan(0);
    });

    it('should call echo tool successfully', async () => {
      const result = await basicClient.callTool('echo', { message: 'hello' });

      expect(result.success).toBe(true);
      expect(result.data?.content).toBeDefined();
      expect((result.data?.content[0] as any)?.text).toContain('hello');
    });
  });
});

describe('MCP Gateway E2E - Header Forwarding', () => {
  it('should add passthrough headers to upstream requests', async () => {
    await headerClient.connect();
    await headerClient.listTools();

    // Check what headers the mock server received
    const requests = headerServer.getRequestsByMethod('tools/list');
    expect(requests.length).toBeGreaterThan(0);

    const headers = requests[0].headers;
    // Passthrough headers should be present
    expect(headers['x-gateway-id']).toBe('test-gateway');
  });
});

describe('MCP Gateway E2E - Error Handling', () => {
  beforeAll(async () => {
    await errorClient.connect();
  });

  it('should handle upstream errors gracefully', async () => {
    // Configure mock to return error for tools/call
    errorServer.setErrorForMethod('tools/call', {
      code: -32603,
      message: 'Internal upstream error',
    });

    const result = await errorClient.callTool('echo', { message: 'test' });

    expect(result.success).toBe(false);
    expect(result.error?.message).toBeDefined();

    // Reset error
    errorServer.setErrorForMethod('tools/call', null);
  });

  it('should handle upstream delays', async () => {
    errorServer.setResponseDelay(100);

    const start = Date.now();
    const result = await errorClient.callTool('echo', { message: 'delayed' });
    const elapsed = Date.now() - start;

    expect(result.success).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(100);

    errorServer.setResponseDelay(0);
  });
});

describe('MCP Gateway E2E - Tool Policies', () => {
  beforeAll(async () => {
    await policyClient.connect();
  });

  it('should filter tools list based on allowed/blocked', async () => {
    const result = await policyClient.listTools();

    expect(result.success).toBe(true);
    // Only echo should be in the list
    const toolNames = result.data?.tools.map((t) => t.name) ?? [];
    expect(toolNames).toContain('echo');
    expect(toolNames).not.toContain('get_headers'); // Not in allowed list
    expect(toolNames).not.toContain('fail'); // Blocked
  });

  it('should reject calls to blocked tools', async () => {
    const result = await policyClient.callTool('fail', {});

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('blocked');
  });

  it('should reject calls to tools not in allowed list', async () => {
    const result = await policyClient.callTool('get_headers', {});

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('not allowed');
  });
});
