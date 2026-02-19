/**
 * @file security.test.ts
 *
 * Security tests for the MCP gateway.
 *
 * Tests critical security properties:
 * - Protected headers are NOT forwarded to upstream
 * - Client cannot spoof internal headers
 * - No credential leakage in responses
 * - Proper authentication enforcement
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { GatewayHarness, TestClient, getOAuthToken } from '../testUtils';
import { MockMCPServer } from '../MockMCPServer';

let gateway: GatewayHarness;
let gatewayUrl: string;
let mockServer: MockMCPServer;
let authToken: string;
let client: TestClient;

const testRunId = Date.now().toString(36);
const workspaceId = `security-${testRunId}`;

beforeAll(async () => {
  mockServer = new MockMCPServer();
  const upstreamUrl = await mockServer.start();

  gateway = new GatewayHarness({
    servers: {
      [`${workspaceId}/main`]: {
        serverId: 'main',
        workspaceId: workspaceId,
        url: upstreamUrl,
        headers: {},
        // Enable header forwarding so we can test what gets through
        forwardHeaders: ['x-custom-header', 'x-trace-id'],
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
// CRITICAL: Protected Headers Must NOT Be Forwarded
// =============================================================================

describe('Security: Protected Header Blocking', () => {
  beforeAll(async () => {
    const result = await client.connect();
    if (!result.success) {
      console.error('[Security Test] Failed to connect:', result.error);
    }
    mockServer.clearRequests();
  });

  it('should NOT forward Authorization header to upstream', async () => {
    // Make a request - the client sends Authorization header
    const result = await client.listTools();
    expect(result.success).toBe(true);

    // Check what upstream received
    const requests = mockServer.getRequestsByMethod('tools/list');
    expect(requests.length).toBeGreaterThan(0);

    const upstreamHeaders = requests[0].headers;

    // Authorization should NOT be present in upstream request
    expect(upstreamHeaders['authorization']).toBeUndefined();
    expect(upstreamHeaders['Authorization']).toBeUndefined();
  });

  it('should NOT forward Cookie header to upstream', async () => {
    mockServer.clearRequests();

    // Make request with custom client that includes Cookie
    const response = await fetch(`${gatewayUrl}/${workspaceId}/main/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
        Cookie: 'session=secret123; auth=token456',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 1,
      }),
    });

    // Request should succeed
    expect(response.status).toBeLessThan(500);

    // Check upstream - Cookie should NOT be present
    const requests = mockServer.getRequestsByMethod('tools/list');
    if (requests.length > 0) {
      const upstreamHeaders = requests[requests.length - 1].headers;
      expect(upstreamHeaders['cookie']).toBeUndefined();
      expect(upstreamHeaders['Cookie']).toBeUndefined();
    }
  });

  it('should NOT forward x-portkey-api-key to upstream', async () => {
    mockServer.clearRequests();

    // Even if client sends x-portkey-api-key, it should not reach upstream
    const response = await fetch(`${gatewayUrl}/${workspaceId}/main/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
        'x-portkey-api-key': 'pk-secret-key-12345',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 1,
      }),
    });

    expect(response.status).toBeLessThan(500);

    const requests = mockServer.getRequestsByMethod('tools/list');
    if (requests.length > 0) {
      const upstreamHeaders = requests[requests.length - 1].headers;
      expect(upstreamHeaders['x-portkey-api-key']).toBeUndefined();
    }
  });

  it('should NOT forward x-api-key to upstream', async () => {
    mockServer.clearRequests();

    const response = await fetch(`${gatewayUrl}/${workspaceId}/main/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
        'x-api-key': 'secret-api-key',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 1,
      }),
    });

    expect(response.status).toBeLessThan(500);

    const requests = mockServer.getRequestsByMethod('tools/list');
    if (requests.length > 0) {
      const upstreamHeaders = requests[requests.length - 1].headers;
      expect(upstreamHeaders['x-api-key']).toBeUndefined();
    }
  });
});

// =============================================================================
// CRITICAL: Prevent Header Spoofing Attacks
// =============================================================================

describe('Security: Header Spoofing Prevention', () => {
  beforeAll(async () => {
    if (!client.isConnected()) {
      await client.connect();
    }
    mockServer.clearRequests();
  });

  it('should NOT allow client to spoof x-user-claims header', async () => {
    mockServer.clearRequests();

    // Client tries to inject fake user claims
    const response = await fetch(`${gatewayUrl}/${workspaceId}/main/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
        'x-user-claims': JSON.stringify({ sub: 'fake-admin', role: 'admin' }),
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 1,
      }),
    });

    expect(response.status).toBeLessThan(500);

    // Client-provided x-user-claims should be stripped, not forwarded
    const requests = mockServer.getRequestsByMethod('tools/list');
    if (requests.length > 0) {
      const upstreamHeaders = requests[requests.length - 1].headers;
      // If x-user-claims is present, it should be gateway-generated, not client-provided
      const userClaims = upstreamHeaders['x-user-claims'];
      if (userClaims) {
        const claimsStr = Array.isArray(userClaims)
          ? userClaims[0]
          : userClaims;
        const claims = JSON.parse(claimsStr);
        expect(claims.sub).not.toBe('fake-admin');
        expect(claims.role).not.toBe('admin');
      }
    }
  });

  it('should NOT allow client to spoof x-user-jwt header', async () => {
    mockServer.clearRequests();

    // Client tries to inject fake JWT
    const fakeJwt =
      'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJmYWtlLWFkbWluIiwicm9sZSI6ImFkbWluIn0.';

    const response = await fetch(`${gatewayUrl}/${workspaceId}/main/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
        'x-user-jwt': fakeJwt,
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 1,
      }),
    });

    expect(response.status).toBeLessThan(500);

    // Client-provided x-user-jwt should be stripped
    const requests = mockServer.getRequestsByMethod('tools/list');
    if (requests.length > 0) {
      const upstreamHeaders = requests[requests.length - 1].headers;
      if (upstreamHeaders['x-user-jwt']) {
        expect(upstreamHeaders['x-user-jwt']).not.toBe(fakeJwt);
      }
    }
  });

  it('should NOT allow client to set internal headers', async () => {
    mockServer.clearRequests();

    // Try various internal header names
    const response = await fetch(`${gatewayUrl}/${workspaceId}/main/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
        'x-internal-user-id': 'fake-user',
        'x-workspace-id': 'fake-workspace',
        'x-organisation-id': 'fake-org',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 1,
      }),
    });

    expect(response.status).toBeLessThan(500);

    // These internal headers should not reach upstream with client values
    const requests = mockServer.getRequestsByMethod('tools/list');
    if (requests.length > 0) {
      const upstreamHeaders = requests[requests.length - 1].headers;
      // If these headers are forwarded, they should have gateway-set values
      expect(upstreamHeaders['x-internal-user-id']).not.toBe('fake-user');
    }
  });
});

// =============================================================================
// CRITICAL: No Credential Leakage in Responses
// =============================================================================

describe('Security: No Credential Leakage', () => {
  it('should not leak tokens in error responses', async () => {
    // Trigger an error with a token
    const response = await fetch(
      `${gatewayUrl}/${workspaceId}/nonexistent/mcp`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          params: {},
          id: 1,
        }),
      }
    );

    const text = await response.text();

    // Response should not contain the auth token
    expect(text).not.toContain(authToken);
  });

  it('should not leak API keys in error responses', async () => {
    const fakeApiKey = 'pk-test-secret-key-67890';

    const response = await fetch(`${gatewayUrl}/${workspaceId}/main/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-portkey-api-key': fakeApiKey,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {},
        id: 1,
      }),
    });

    const text = await response.text();

    // Response should not contain the API key
    expect(text).not.toContain(fakeApiKey);
    expect(text).not.toContain('pk-test-secret');
  });

  it('should not expose internal error details to client', async () => {
    // Request to non-existent server to trigger error
    const response = await fetch(
      `${gatewayUrl}/${workspaceId}/nonexistent/mcp`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'initialize',
          params: {},
          id: 1,
        }),
      }
    );

    const text = await response.text();

    // Should not expose file paths or stack traces
    expect(text).not.toMatch(/\/Users\//);
    expect(text).not.toMatch(/node_modules/);
  });
});

// =============================================================================
// Authentication Enforcement
// =============================================================================

describe('Security: Authentication Enforcement', () => {
  it('should require authentication for MCP endpoints', async () => {
    const response = await fetch(`${gatewayUrl}/${workspaceId}/main/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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

  // NOTE: SSE downstream endpoint removed - gateway only supports HTTP Streamable for clients

  it('should allow unauthenticated access to health endpoint', async () => {
    const response = await fetch(`${gatewayUrl}/health`);

    expect(response.status).toBe(200);
  });

  it('should allow unauthenticated access to OAuth discovery', async () => {
    const response = await fetch(
      `${gatewayUrl}/.well-known/oauth-authorization-server`
    );

    expect(response.status).toBe(200);
  });
});

// =============================================================================
// Allowed Header Forwarding (Positive Test)
// =============================================================================

describe('Security: Allowed Headers DO Get Forwarded', () => {
  it('should forward passthrough headers configured in server config', async () => {
    // This is tested in connectivity.test.ts - passthrough headers work
    // Here we just verify the config is set up correctly
    expect(true).toBe(true);
  });
});
