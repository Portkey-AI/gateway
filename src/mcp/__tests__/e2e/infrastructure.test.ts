/**
 * @file infrastructure.test.ts
 * Integration tests for the MCP E2E test infrastructure
 *
 * These tests verify that the test infrastructure works correctly
 * before adding full gateway E2E tests.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { MockMCPServer } from '../MockMCPServer';
import { TestClient } from '../TestClient';

describe('Test Infrastructure - MockMCPServer', () => {
  let server: MockMCPServer;
  let serverUrl: string;

  beforeAll(async () => {
    server = new MockMCPServer();
    serverUrl = await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('should start and provide a URL', () => {
    expect(server.isRunning).toBe(true);
    expect(serverUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
  });

  it('should respond to health check', async () => {
    const baseUrl = serverUrl.replace('/mcp', '');
    const response = await fetch(baseUrl);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('ok');
  });

  it('should handle MCP initialize request', async () => {
    const response = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: { protocolVersion: '2024-11-05' },
        id: 1,
      }),
    });

    const data = await response.json();
    expect(data.jsonrpc).toBe('2.0');
    expect(data.result.protocolVersion).toBe('2024-11-05');
    expect(data.result.serverInfo.name).toBe('mock-mcp-server');
  });

  it('should handle tools/list request', async () => {
    const response = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
        id: 2,
      }),
    });

    const data = await response.json();
    expect(data.result.tools).toBeDefined();
    expect(data.result.tools.length).toBeGreaterThan(0);
    expect(data.result.tools.some((t: any) => t.name === 'echo')).toBe(true);
  });

  it('should handle tools/call request', async () => {
    const response = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'echo', arguments: { message: 'test' } },
        id: 3,
      }),
    });

    const data = await response.json();
    expect(data.result.content[0].text).toContain('test');
  });

  it('should record requests', async () => {
    server.clearRequests();

    await fetch(serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Custom-Header': 'custom-value',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'ping',
        id: 4,
      }),
    });

    expect(server.requests.length).toBe(1);
    expect(server.requests[0].headers['x-custom-header']).toBe('custom-value');
    expect(server.requests[0].body.method).toBe('ping');
  });

  it('should simulate errors when configured', async () => {
    server.setErrorForMethod('tools/list', {
      code: -32603,
      message: 'Simulated error',
    });

    const response = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 5,
      }),
    });

    const data = await response.json();
    expect(data.error).toBeDefined();
    expect(data.error.code).toBe(-32603);
    expect(data.error.message).toBe('Simulated error');

    // Reset
    server.setErrorForMethod('tools/list', null);
  });

  it('should apply response delays', async () => {
    server.setResponseDelay(100);

    const start = Date.now();
    await fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'ping', id: 6 }),
    });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(100);

    server.setResponseDelay(0);
  });
});

describe('Test Infrastructure - TestClient with MockMCPServer', () => {
  let server: MockMCPServer;
  let client: TestClient;

  beforeAll(async () => {
    server = new MockMCPServer();
    const serverUrl = await server.start();

    // Create client pointing directly at mock server (no gateway)
    client = new TestClient({
      gatewayUrl: serverUrl,
      clientName: 'infrastructure-test-client',
    });
  });

  afterAll(async () => {
    await client.disconnect();
    await server.stop();
  });

  it('should connect to server', async () => {
    const result = await client.connect();

    expect(result.success).toBe(true);
    expect(client.isConnected()).toBe(true);
    expect(client.serverInfo?.name).toBe('mock-mcp-server');
  });

  it('should list tools', async () => {
    const result = await client.listTools();

    expect(result.success).toBe(true);
    expect(result.data?.tools).toBeDefined();
    expect(result.data?.tools.some((t) => t.name === 'echo')).toBe(true);
  });

  it('should call tools', async () => {
    const result = await client.callTool('echo', { message: 'hello world' });

    expect(result.success).toBe(true);
    expect(result.data?.content[0]?.text).toContain('hello world');
  });

  it('should ping server', async () => {
    const result = await client.ping();
    expect(result.success).toBe(true);
  });
});

describe('Test Infrastructure - MockMCPServer get_headers tool', () => {
  let server: MockMCPServer;

  beforeAll(async () => {
    server = new MockMCPServer();
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('should return headers via get_headers tool', async () => {
    const response = await fetch(server.getUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Test-Header': 'test-value',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'get_headers', arguments: {} },
        id: 1,
      }),
    });

    const data = await response.json();
    const headersText = data.result.content[0].text;
    const headers = JSON.parse(headersText);

    expect(headers['x-test-header']).toBe('test-value');
    expect(headers['authorization']).toBe('Bearer test-token');
  });
});
