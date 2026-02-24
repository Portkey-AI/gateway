# MCP Gateway E2E Test Cases

This document outlines all test cases for the MCP Gateway E2E test suite.

## Test Infrastructure

| Component | File | Description |
|-----------|------|-------------|
| **MockMCPServer** | `MockMCPServer.ts` | Minimal mock for header/error testing |
| **EverythingServer** | `EverythingServer.ts` | Official MCP reference server |
| **TestClient** | `TestClient.ts` | MCP SDK client wrapper |
| **GatewayHarness** | `testUtils.ts` | Gateway process manager |
| **TestEnvironment** | `testUtils.ts` | Complete test setup helper |

### Infrastructure Tests (Start Here!)

Run `npm test -- src/mcp/__tests__/e2e/infrastructure.test.ts` to verify the test infrastructure works.

---

## Known Limitations

### Authentication for Full E2E Tests

The MCP Gateway uses Portkey authentication which requires either:
1. A running control plane (`ALBUS_BASEPATH`) for API key validation
2. OAuth token introspection

For full E2E tests through the gateway, you'll need one of:
- **Mock Auth Service**: A simple HTTP server that responds to auth endpoints
- **Test Mode**: Environment variable to bypass auth (needs gateway modification)
- **Integration with Portkey**: Use real Portkey test credentials

Currently, the infrastructure tests verify MockMCPServer and TestClient work correctly.
The connectivity tests are designed for when auth is available/mocked.

---

## Phase 2: Test Cases

### 1. Connectivity & Protocol Compliance ✅

| Test Case | Priority | Status |
|-----------|----------|--------|
| Health check endpoint responds | High | ✅ Done |
| Root endpoint returns gateway info | Medium | ✅ Done |
| MCP initialize succeeds | High | ✅ Done |
| Ping responds after init | Medium | ✅ Done |
| List tools returns tools | High | ✅ Done |
| Tool call succeeds | High | ✅ Done |

### 2. Authentication

| Test Case | Priority | Status |
|-----------|----------|--------|
| API key auth allows access | High | 🔲 TODO |
| Missing auth returns 401 | High | 🔲 TODO |
| Invalid API key returns 401 | High | 🔲 TODO |
| OAuth token auth allows access | Medium | 🔲 TODO |
| Expired OAuth token returns 401 | Medium | 🔲 TODO |

### 3. Header Forwarding ✅

| Test Case | Priority | Status |
|-----------|----------|--------|
| Static passthroughHeaders forwarded | High | ✅ Done |
| forwardHeaders (allowlist) works | High | ✅ Done |
| forwardHeaders (all-except) works | Medium | 🔲 TODO |
| Protected headers NOT forwarded | Critical | ✅ Done |
| Auth headers NOT forwarded | Critical | 🔲 TODO |

### 4. Tool Policies

| Test Case | Priority | Status |
|-----------|----------|--------|
| Allowed tools filter works | High | 🔲 TODO |
| Blocked tools return error | High | 🔲 TODO |
| Unlisted tool (with allowed list) blocked | High | 🔲 TODO |
| tools/list respects allow/block | High | 🔲 TODO |
| Rate limiting (if implemented) | Low | 🔲 TODO |

### 5. Error Handling ✅

| Test Case | Priority | Status |
|-----------|----------|--------|
| Upstream error propagated | High | ✅ Done |
| Upstream timeout handled | Medium | ✅ Done |
| Invalid MCP request rejected | Medium | 🔲 TODO |
| Unknown method handled gracefully | Low | 🔲 TODO |
| Server config not found returns error | Medium | 🔲 TODO |

### 6. User Identity Forwarding

| Test Case | Priority | Status |
|-----------|----------|--------|
| claims_header mode works | High | 🔲 TODO |
| bearer mode works | Medium | 🔲 TODO |
| jwt_header mode works | Medium | 🔲 TODO |
| include_claims filters correctly | Medium | 🔲 TODO |

### 7. Protocol Features (with Everything Server)

| Test Case | Priority | Status |
|-----------|----------|--------|
| List prompts | Medium | 🔲 TODO |
| Get prompt | Medium | 🔲 TODO |
| List resources | Medium | 🔲 TODO |
| Read resource | Medium | 🔲 TODO |
| Completion/complete | Low | 🔲 TODO |
| Logging level | Low | 🔲 TODO |

### 8. Transport & Connection

| Test Case | Priority | Status |
|-----------|----------|--------|
| HTTP Streamable transport works | High | ✅ Done |
| SSE upstream fallback works | Medium | 🔲 TODO |
| Connection recovery | Low | 🔲 TODO |

### 9. Multi-Server

| Test Case | Priority | Status |
|-----------|----------|--------|
| Multiple servers configured | Medium | 🔲 TODO |
| Correct routing by serverId | High | 🔲 TODO |
| Correct routing by workspaceId | High | 🔲 TODO |

---

## Running Tests

```bash
# Run all MCP E2E tests
npm test -- --testPathPattern="src/mcp/__tests__"

# Run specific test file
npm test -- src/mcp/__tests__/e2e/connectivity.test.ts

# Run with debug output
DEBUG=true npm test -- --testPathPattern="src/mcp/__tests__"

# Run tests matching a pattern
npm test -- --testNamePattern="Header Forwarding"
```

## Writing New Tests

```typescript
import { createTestEnvironment, TestEnvironment } from '../testUtils';

describe('My Test Suite', () => {
  let env: TestEnvironment;

  beforeAll(async () => {
    env = await createTestEnvironment({
      // Use official server for protocol tests
      useEverythingServer: true,
      // Or use mock for header/error tests
      // useEverythingServer: false,
      
      workspaceId: 'my-workspace',
      serverId: 'my-server',
      serverConfig: {
        // Custom server config
        tools: { allowed: ['echo'] },
      },
    });
  }, 30000);

  afterAll(async () => {
    await env.cleanup();
  });

  it('should do something', async () => {
    await env.client.connect();
    const result = await env.client.listTools();
    expect(result.success).toBe(true);
  });
});
```

## Notes

- **MockMCPServer**: Use for testing gateway-specific behavior (headers, errors)
- **EverythingServer**: Use for testing MCP protocol compliance
- **Timeout**: Set 30s for `beforeAll` to allow server startup
- **Cleanup**: Always call `env.cleanup()` in `afterAll`

