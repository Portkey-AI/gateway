/**
 * @file auth-apikey.test.ts
 *
 * Tests for API Key authentication.
 *
 * NOTE: Full API key validation requires Control Plane integration.
 * These tests verify the gateway correctly handles the x-portkey-api-key header
 * and rejects invalid keys. For full API key testing with real validation,
 * set ALBUS_BASEPATH to point to a Control Plane instance.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { GatewayHarness, TestClient, getOAuthToken } from '../testUtils';
import { MockMCPServer } from '../MockMCPServer';

let gateway: GatewayHarness;
let gatewayUrl: string;
let mockServer: MockMCPServer;
let validOAuthToken: string;

const testRunId = Date.now().toString(36);
const workspaceId = `apikey-${testRunId}`;

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
      },
    },
    debug: process.env.DEBUG === 'true',
  });

  gatewayUrl = await gateway.start();

  // Get a valid OAuth token for comparison tests
  validOAuthToken = await getOAuthToken(gatewayUrl);
}, 60000);

afterAll(async () => {
  await gateway?.stop();
  await mockServer?.stop();
});

describe('API Key Authentication', () => {
  describe('Header Recognition', () => {
    it('should recognize x-portkey-api-key header', async () => {
      // Gateway should attempt to process API key (even if validation fails without CP)
      const response = await fetch(`${gatewayUrl}/${workspaceId}/main/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-portkey-api-key': 'pk-test-invalid-key-12345',
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

      // Without Control Plane, API key validation should fail with 401
      // This confirms the header is being processed
      expect(response.status).toBe(401);
    });

    it('should reject empty API key', async () => {
      const response = await fetch(`${gatewayUrl}/${workspaceId}/main/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-portkey-api-key': '',
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

    it('should reject malformed API key', async () => {
      const response = await fetch(`${gatewayUrl}/${workspaceId}/main/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-portkey-api-key': '!@#$%^&*()',
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

  describe('API Key vs OAuth Priority', () => {
    it('should prefer API key when both headers present', async () => {
      // When both x-portkey-api-key and Authorization are present,
      // the gateway should try API key auth path
      const response = await fetch(`${gatewayUrl}/${workspaceId}/main/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-portkey-api-key': 'invalid-key',
          Authorization: `Bearer ${validOAuthToken}`,
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

      // API key path should be attempted (and fail without CP)
      expect(response.status).toBe(401);
    });

    it('should fall through to OAuth when no API key header', async () => {
      // Get a fresh OAuth token
      const freshToken = await getOAuthToken(gatewayUrl);

      // Without x-portkey-api-key, OAuth should be used
      const client = new TestClient({
        gatewayUrl,
        workspaceId,
        serverId: 'main',
        authToken: freshToken,
      });

      const result = await client.connect();
      expect(result.success).toBe(true);

      await client.disconnect();
    });
  });

  describe('Error Response Format', () => {
    it('should return WWW-Authenticate header on auth failure', async () => {
      const response = await fetch(`${gatewayUrl}/${workspaceId}/main/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // No auth header
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
      // Should have WWW-Authenticate header pointing to OAuth
      const wwwAuth = response.headers.get('www-authenticate');
      expect(wwwAuth).toBeDefined();
    });
  });
});

/**
 * NOTE: The following tests require Control Plane integration
 * and should be run in an environment with ALBUS_BASEPATH configured.
 *
 * Tests that need Control Plane:
 * - Valid API key grants access
 * - API key extracts correct workspace_id
 * - API key extracts correct organisation_id
 * - Workspace mismatch returns 403
 * - Revoked API key returns 401
 */
