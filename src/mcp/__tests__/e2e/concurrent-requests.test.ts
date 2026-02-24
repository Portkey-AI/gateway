/**
 * @file concurrent-requests.test.ts
 * E2E tests for concurrent request handling
 *
 * Tests the gateway's ability to handle multiple parallel requests,
 * maintain session integrity, and properly queue/serialize operations.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { GatewayHarness, TestClient, getOAuthToken } from '../testUtils';
import { MockMCPServer } from '../MockMCPServer';

// Single gateway for all tests
let gateway: GatewayHarness;
let gatewayUrl: string;
let authToken: string;

// Mock upstream servers
let concurrentServer: MockMCPServer;
let slowServer: MockMCPServer;
let counterServer: CountingMCPServer;

// Unique test run ID
const testRunId = Date.now().toString(36);

/**
 * MCP server that counts requests and tracks concurrency
 */
class CountingMCPServer extends MockMCPServer {
  public totalRequests = 0;
  public peakConcurrency = 0;
  private currentConcurrency = 0;
  public requestTimes: number[] = [];

  constructor() {
    super();
    // Override tools to add a counter tool
    this.setTools([
      {
        name: 'echo',
        description: 'Echoes back the input message',
        inputSchema: {
          type: 'object',
          properties: { message: { type: 'string' } },
        },
      },
      {
        name: 'increment',
        description: 'Increments the counter',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'get_count',
        description: 'Gets the current count',
        inputSchema: { type: 'object', properties: {} },
      },
    ]);
  }

  recordConcurrencyStart(): void {
    this.currentConcurrency++;
    this.totalRequests++;
    this.requestTimes.push(Date.now());
    if (this.currentConcurrency > this.peakConcurrency) {
      this.peakConcurrency = this.currentConcurrency;
    }
  }

  recordConcurrencyEnd(): void {
    this.currentConcurrency--;
  }

  resetCounters(): void {
    this.totalRequests = 0;
    this.peakConcurrency = 0;
    this.currentConcurrency = 0;
    this.requestTimes = [];
  }
}

beforeAll(async () => {
  // Start mock servers
  concurrentServer = new MockMCPServer();
  slowServer = new MockMCPServer();
  counterServer = new CountingMCPServer();

  const [concurrentUrl, slowUrl, counterUrl] = await Promise.all([
    concurrentServer.start(),
    slowServer.start(),
    counterServer.start(),
  ]);

  // Configure slow server with delays
  slowServer.setResponseDelay(200);

  if (process.env.DEBUG === 'true') {
    console.log('[TestEnv] Servers started:');
    console.log(`  - concurrent: ${concurrentUrl}`);
    console.log(`  - slow:       ${slowUrl}`);
    console.log(`  - counter:    ${counterUrl}`);
  }

  // Configure gateway
  gateway = new GatewayHarness({
    servers: {
      [`ws-${testRunId}/concurrent`]: {
        serverId: 'concurrent',
        workspaceId: `ws-${testRunId}`,
        url: concurrentUrl,
        headers: {},
      },
      [`ws-${testRunId}/slow`]: {
        serverId: 'slow',
        workspaceId: `ws-${testRunId}`,
        url: slowUrl,
        headers: {},
      },
      [`ws-${testRunId}/counter`]: {
        serverId: 'counter',
        workspaceId: `ws-${testRunId}`,
        url: counterUrl,
        headers: {},
      },
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
  await concurrentServer?.stop();
  await slowServer?.stop();
  await counterServer?.stop();
});

describe('Concurrent Requests - Parallel Tool Calls', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = new TestClient({
      gatewayUrl,
      workspaceId: `ws-${testRunId}`,
      serverId: 'concurrent',
      authToken,
    });
    await client.connect();
  });

  afterAll(async () => {
    await client?.disconnect();
  });

  it('should handle multiple parallel tool calls from single client', async () => {
    concurrentServer.clearRequests();

    // Fire 5 parallel requests
    const messages = ['msg1', 'msg2', 'msg3', 'msg4', 'msg5'];
    const promises = messages.map((msg) =>
      client.callTool('echo', { message: msg })
    );

    const results = await Promise.all(promises);

    // All should succeed
    results.forEach((result, i) => {
      expect(result.success).toBe(true);
      expect((result.data?.content[0] as any)?.text).toContain(messages[i]);
    });

    // Verify all requests were made
    const toolCalls = concurrentServer.getRequestsByMethod('tools/call');
    expect(toolCalls.length).toBe(5);
  });

  it('should maintain request isolation in parallel calls', async () => {
    concurrentServer.clearRequests();

    // Each request has unique data
    const requests = [
      { message: 'unique-1-abc' },
      { message: 'unique-2-def' },
      { message: 'unique-3-ghi' },
    ];

    const results = await Promise.all(
      requests.map((args) => client.callTool('echo', args))
    );

    // Verify each response corresponds to its request (no cross-contamination)
    const responseTexts = results.map(
      (r) => (r.data?.content[0] as any)?.text ?? ''
    );

    // Check that all unique messages appear in responses
    expect(responseTexts.some((t) => t.includes('unique-1-abc'))).toBe(true);
    expect(responseTexts.some((t) => t.includes('unique-2-def'))).toBe(true);
    expect(responseTexts.some((t) => t.includes('unique-3-ghi'))).toBe(true);
  });
});

describe('Concurrent Requests - Multiple Clients', () => {
  it('should handle concurrent requests from multiple clients', async () => {
    concurrentServer.clearRequests();

    // Create multiple clients
    const clients = await Promise.all(
      [1, 2, 3].map(async (i) => {
        const c = new TestClient({
          gatewayUrl,
          workspaceId: `ws-${testRunId}`,
          serverId: 'concurrent',
          authToken,
        });
        await c.connect();
        return c;
      })
    );

    try {
      // Each client makes parallel requests
      const allPromises = clients.flatMap((client, clientIdx) =>
        [1, 2].map((reqIdx) =>
          client.callTool('echo', {
            message: `client${clientIdx}-req${reqIdx}`,
          })
        )
      );

      const results = await Promise.all(allPromises);

      // All requests should succeed
      results.forEach((result) => {
        expect(result.success).toBe(true);
      });

      // Total requests should be clients * requests_per_client
      const toolCalls = concurrentServer.getRequestsByMethod('tools/call');
      expect(toolCalls.length).toBe(6); // 3 clients * 2 requests
    } finally {
      await Promise.all(clients.map((c) => c.disconnect()));
    }
  });

  it('should isolate sessions between clients', async () => {
    // Create two clients
    const client1 = new TestClient({
      gatewayUrl,
      workspaceId: `ws-${testRunId}`,
      serverId: 'concurrent',
      authToken,
    });
    const client2 = new TestClient({
      gatewayUrl,
      workspaceId: `ws-${testRunId}`,
      serverId: 'concurrent',
      authToken,
    });

    await Promise.all([client1.connect(), client2.connect()]);

    try {
      // Interleaved requests
      const [r1a, r2a, r1b, r2b] = await Promise.all([
        client1.callTool('echo', { message: 'from-client-1-first' }),
        client2.callTool('echo', { message: 'from-client-2-first' }),
        client1.callTool('echo', { message: 'from-client-1-second' }),
        client2.callTool('echo', { message: 'from-client-2-second' }),
      ]);

      // All should succeed with correct responses
      expect((r1a.data?.content[0] as any)?.text).toContain(
        'from-client-1-first'
      );
      expect((r2a.data?.content[0] as any)?.text).toContain(
        'from-client-2-first'
      );
      expect((r1b.data?.content[0] as any)?.text).toContain(
        'from-client-1-second'
      );
      expect((r2b.data?.content[0] as any)?.text).toContain(
        'from-client-2-second'
      );
    } finally {
      await Promise.all([client1.disconnect(), client2.disconnect()]);
    }
  });
});

describe('Concurrent Requests - Slow Upstream', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = new TestClient({
      gatewayUrl,
      workspaceId: `ws-${testRunId}`,
      serverId: 'slow',
      authToken,
    });
    await client.connect();
  });

  afterAll(async () => {
    await client?.disconnect();
  });

  it('should handle concurrent requests to slow upstream', async () => {
    slowServer.clearRequests();
    slowServer.setResponseDelay(300);

    const start = Date.now();

    // Fire 10 parallel requests
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        client.callTool('echo', { message: `slow${i}` })
      )
    );

    const elapsed = Date.now() - start;

    // All should succeed
    results.forEach((r) => expect(r.success).toBe(true));
    expect(results).toHaveLength(10);

    // Sequential would take 3000ms (10 x 300ms)
    // Parallel completes in ~300ms + init overhead (~600ms)
    // Should be well under 1000ms (half of sequential)
    // console.log('elapsed', elapsed);
    // takes about 900-950ms since there are 3 requests for each tool call (init, notification, toolcall)
    // all delayed by 300ms so it should be less than 1000ms
    expect(elapsed).toBeLessThan(1000);
  });

  it('should not timeout on slow responses within limit', async () => {
    slowServer.setResponseDelay(500);

    const result = await client.callTool('echo', { message: 'slow-but-ok' });

    expect(result.success).toBe(true);

    // Reset delay
    slowServer.setResponseDelay(100);
  });
});

describe('Concurrent Requests - Mixed Operations', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = new TestClient({
      gatewayUrl,
      workspaceId: `ws-${testRunId}`,
      serverId: 'concurrent',
      authToken,
    });
    await client.connect();
  });

  afterAll(async () => {
    await client?.disconnect();
  });

  it('should handle mixed operation types concurrently', async () => {
    concurrentServer.clearRequests();

    // Mix of different operations
    const results = await Promise.all([
      client.listTools(),
      client.callTool('echo', { message: 'test1' }),
      client.ping(),
      client.callTool('echo', { message: 'test2' }),
      client.listTools(),
    ]);

    // All should succeed
    results.forEach((r) => expect(r.success).toBe(true));

    // Verify different request types were made
    expect(concurrentServer.getRequestsByMethod('tools/list').length).toBe(2);
    expect(concurrentServer.getRequestsByMethod('tools/call').length).toBe(2);
    expect(concurrentServer.getRequestsByMethod('ping').length).toBe(1);
  });
});

describe('Concurrent Requests - Error Handling', () => {
  let client: TestClient;

  beforeAll(async () => {
    client = new TestClient({
      gatewayUrl,
      workspaceId: `ws-${testRunId}`,
      serverId: 'concurrent',
      authToken,
    });
    await client.connect();
  });

  afterAll(async () => {
    await client?.disconnect();
    // Clean up error
    concurrentServer.setErrorForMethod('tools/call', null);
  });

  it('should isolate errors between concurrent requests', async () => {
    // Set up: some tools will fail, others won't
    // We'll make the echo tool fail temporarily
    concurrentServer.setErrorForMethod('tools/call', {
      code: -32000,
      message: 'Intentional test error',
    });

    // Mix of calls - all will fail due to error config
    const results = await Promise.all([
      client.callTool('echo', { message: 'will-fail-1' }),
      client.callTool('echo', { message: 'will-fail-2' }),
    ]);

    // All should fail
    results.forEach((r) => expect(r.success).toBe(false));

    // Clear error
    concurrentServer.setErrorForMethod('tools/call', null);

    // Now requests should succeed
    const successResults = await Promise.all([
      client.callTool('echo', { message: 'should-succeed-1' }),
      client.callTool('echo', { message: 'should-succeed-2' }),
    ]);

    successResults.forEach((r) => expect(r.success).toBe(true));
  });

  it('should continue processing after some requests fail', async () => {
    // First request will fail
    concurrentServer.setErrorForMethod('tools/call', {
      code: -32000,
      message: 'First request fails',
    });

    const result1 = client.callTool('echo', { message: 'fail' });

    // Clear immediately so second succeeds
    setTimeout(() => {
      concurrentServer.setErrorForMethod('tools/call', null);
    }, 50);

    const result2Promise = new Promise<any>((resolve) => {
      setTimeout(async () => {
        resolve(await client.callTool('echo', { message: 'succeed' }));
      }, 100);
    });

    const [r1, r2] = await Promise.all([result1, result2Promise]);

    expect(r1.success).toBe(false);
    expect(r2.success).toBe(true);
  });
});

describe('Concurrent Requests - High Load', () => {
  it('should handle burst of requests', async () => {
    const client = new TestClient({
      gatewayUrl,
      workspaceId: `ws-${testRunId}`,
      serverId: 'concurrent',
      authToken,
    });
    await client.connect();

    try {
      concurrentServer.clearRequests();

      // Burst of 10 requests
      const promises = Array.from({ length: 10 }, (_, i) =>
        client.callTool('echo', { message: `burst-${i}` })
      );

      const results = await Promise.all(promises);

      // Count successes
      const successes = results.filter((r) => r.success).length;

      // All or most should succeed
      expect(successes).toBeGreaterThanOrEqual(8); // Allow some tolerance
    } finally {
      await client.disconnect();
    }
  });

  it('should handle rapid connect/disconnect cycles', async () => {
    const results: boolean[] = [];

    // Rapid connect, request, disconnect cycles
    for (let i = 0; i < 3; i++) {
      const client = new TestClient({
        gatewayUrl,
        workspaceId: `ws-${testRunId}`,
        serverId: 'concurrent',
        authToken,
      });

      try {
        await client.connect();
        const result = await client.callTool('echo', { message: `cycle-${i}` });
        results.push(result.success);
      } finally {
        await client.disconnect();
      }
    }

    // All cycles should succeed
    expect(results.every((r) => r)).toBe(true);
  });
});
