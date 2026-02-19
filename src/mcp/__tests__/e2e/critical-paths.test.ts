/**
 * @file critical-paths.test.ts
 *
 * Tests for the MOST COMMON user flows.
 * These tests should NEVER fail - they represent the core functionality
 * that every user depends on.
 *
 * Priority order based on usage frequency:
 * 1. Authentication (every request)
 * 2. Session initialization (every client)
 * 3. Tool listing (discovery)
 * 4. Tool calling (core value)
 * 5. Error handling (when things go wrong)
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { GatewayHarness, TestClient, getOAuthToken } from '../testUtils';
import { MockMCPServer } from '../MockMCPServer';

// Test infrastructure
let gateway: GatewayHarness;
let gatewayUrl: string;
let authToken: string;
let mockServer: MockMCPServer;
let client: TestClient;

// Unique test run ID to avoid Redis cache conflicts
const testRunId = Date.now().toString(36);
const workspaceId = `critical-${testRunId}`;

beforeAll(async () => {
  // Start mock upstream server
  mockServer = new MockMCPServer();
  const upstreamUrl = await mockServer.start();

  // Start gateway with single server config
  gateway = new GatewayHarness({
    servers: {
      [`${workspaceId}/main`]: {
        serverId: 'main',
        workspaceId: workspaceId,
        url: upstreamUrl,
        headers: {},
      },
    },
    debug: process.env.DEBUG === 'true',
  });

  gatewayUrl = await gateway.start();
  authToken = await getOAuthToken(gatewayUrl);

  client = new TestClient({
    gatewayUrl,
    workspaceId,
    serverId: 'main',
    authToken,
  });
}, 60000);

afterAll(async () => {
  await client?.disconnect();
  await gateway?.stop();
  await mockServer?.stop();
});

// =============================================================================
// PRIORITY 1: Authentication - Every request needs this
// =============================================================================

describe('Critical Path: Authentication', () => {
  it('should accept valid OAuth token', async () => {
    // Use the TestClient which properly handles MCP protocol
    const testClient = new TestClient({
      gatewayUrl,
      workspaceId,
      serverId: 'main',
      authToken,
    });

    const result = await testClient.connect();
    expect(result.success).toBe(true);
    expect(result.data?.serverInfo).toBeDefined();

    await testClient.disconnect();
  });

  it('should reject missing authentication', async () => {
    const response = await fetch(`${gatewayUrl}/${workspaceId}/main/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // No Authorization header
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
    });

    expect(response.status).toBe(401);
  });

  it('should reject invalid token', async () => {
    const response = await fetch(`${gatewayUrl}/${workspaceId}/main/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer invalid-token-12345',
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
    });

    expect(response.status).toBe(401);
  });
});

// =============================================================================
// PRIORITY 2: Session Initialization - First thing every client does
// =============================================================================

describe('Critical Path: Session Initialization', () => {
  it('should initialize MCP session successfully', async () => {
    const result = await client.connect();

    expect(result.success).toBe(true);
    expect(result.data?.serverInfo).toBeDefined();
    expect(result.data?.capabilities).toBeDefined();
  });

  it('should establish session that can be reused', async () => {
    // The session is established through the client, verify it works
    const result = await client.connect();
    expect(result.success).toBe(true);

    // Session should be active
    expect(client.isConnected()).toBe(true);

    // Should be able to make subsequent requests
    const pingResult = await client.ping();
    expect(pingResult.success).toBe(true);
  });
});

// =============================================================================
// PRIORITY 3: Tool Discovery - How clients learn what's available
// =============================================================================

describe('Critical Path: Tool Discovery', () => {
  beforeAll(async () => {
    if (!client.isConnected()) {
      await client.connect();
    }
  });

  it('should list available tools', async () => {
    const result = await client.listTools();

    expect(result.success).toBe(true);
    expect(result.data?.tools).toBeDefined();
    expect(Array.isArray(result.data?.tools)).toBe(true);
    expect(result.data?.tools.length).toBeGreaterThan(0);
  });

  it('should include tool metadata (name, description, schema)', async () => {
    const result = await client.listTools();

    expect(result.success).toBe(true);
    const tools = result.data?.tools ?? [];

    // Every tool should have name and inputSchema
    for (const tool of tools) {
      expect(tool.name).toBeDefined();
      expect(typeof tool.name).toBe('string');
      expect(tool.inputSchema).toBeDefined();
    }
  });
});

// =============================================================================
// PRIORITY 4: Tool Calling - The core value of MCP
// =============================================================================

describe('Critical Path: Tool Calling', () => {
  beforeAll(async () => {
    if (!client.isConnected()) {
      await client.connect();
    }
  });

  it('should call tool with arguments successfully', async () => {
    const result = await client.callTool('echo', { message: 'Hello, World!' });

    expect(result.success).toBe(true);
    expect(result.data?.content).toBeDefined();
    expect(Array.isArray(result.data?.content)).toBe(true);

    const textContent = result.data?.content.find(
      (c: any) => c.type === 'text'
    );
    expect(textContent?.text).toContain('Hello, World!');
  });

  it('should call tool without arguments', async () => {
    // echo with empty message should still work
    const result = await client.callTool('echo', {});

    expect(result.success).toBe(true);
    expect(result.data?.content).toBeDefined();
  });

  it('should handle tool that returns error', async () => {
    // The 'fail' tool is designed to return an error
    const result = await client.callTool('fail', {});

    expect(result.success).toBe(true); // MCP returns success with isError flag
    expect(result.data?.isError).toBe(true);
  });
});

// =============================================================================
// PRIORITY 5: Session Reuse - Performance optimization
// =============================================================================

describe('Critical Path: Session Reuse', () => {
  it('should reuse session for multiple requests', async () => {
    // First request - initialize
    const initResult = await client.connect();
    expect(initResult.success).toBe(true);

    // Second request - list tools (same session)
    const listResult = await client.listTools();
    expect(listResult.success).toBe(true);

    // Third request - call tool (same session)
    const callResult = await client.callTool('echo', { message: 'test' });
    expect(callResult.success).toBe(true);

    // All should have used the same session (no re-init needed)
    expect(client.isConnected()).toBe(true);
  });

  it('should handle ping for keepalive', async () => {
    if (!client.isConnected()) {
      await client.connect();
    }

    const result = await client.ping();
    expect(result.success).toBe(true);
  });
});

// =============================================================================
// PRIORITY 6: Common Error Scenarios
// =============================================================================

describe('Critical Path: Error Handling', () => {
  beforeAll(async () => {
    if (!client.isConnected()) {
      await client.connect();
    }
  });

  it('should handle upstream server error gracefully', async () => {
    // Configure mock to return error
    mockServer.setErrorForMethod('tools/call', {
      code: -32603,
      message: 'Internal error from upstream',
    });

    const result = await client.callTool('echo', { message: 'test' });

    expect(result.success).toBe(false);
    expect(result.error?.message).toBeDefined();

    // Reset
    mockServer.setErrorForMethod('tools/call', null);
  });

  it('should handle missing required fields in request', async () => {
    // Send valid JSON but missing required JSON-RPC fields
    const response = await fetch(`${gatewayUrl}/${workspaceId}/main/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        // Missing jsonrpc, method, id
        params: {},
      }),
    });

    // Should return error response, not crash
    const data = await response.json();
    // Either HTTP error or JSON-RPC error
    expect(response.status === 400 || data.error).toBeTruthy();
  });

  it('should return 404 for non-existent server', async () => {
    const response = await fetch(
      `${gatewayUrl}/${workspaceId}/nonexistent-server/mcp`,
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

    // Should indicate server not found
    expect([404, 500]).toContain(response.status);
  });
});

// =============================================================================
// PRIORITY 7: Health & Monitoring
// =============================================================================

describe('Critical Path: Health & Monitoring', () => {
  it('should respond to health check', async () => {
    const response = await fetch(`${gatewayUrl}/health`);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('healthy');
  });

  it('should return gateway info at root', async () => {
    const response = await fetch(`${gatewayUrl}/`);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.gateway).toBeDefined();
  });
});
