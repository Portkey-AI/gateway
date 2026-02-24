# Upstream Connection Pooling Plan

## Problem Statement

Currently, the MCP gateway creates a **new upstream MCP connection for every request**. This introduces latency overhead:

| Operation | Latency Cost |
|-----------|-------------|
| TCP handshake (cold) | ~1 RTT |
| TLS handshake (cold) | ~1-2 RTT |
| MCP initialize handshake | ~1 RTT |
| **Total per request** | **1-4 RTT** |

For upstream servers in different regions, this can add **50-200ms+ per request**.

With HTTP keep-alive, TCP/TLS connections are reused. But the **MCP initialize handshake still happens every request** because we don't reuse upstream `Client` connections.

## Current Architecture

```
Request → Gateway → [Create MCPSession] → [Create Upstream Client] → [MCP Initialize] → [Handle Request] → [Close All]
```

Every request:
1. Creates new `MCPSession`
2. Creates new `Upstream` (MCP Client)
3. Performs MCP initialize handshake with upstream server
4. Handles the request
5. Closes everything

## Proposed Architecture

```
Request → Gateway → [Get/Create Pooled Client] → [Handle Request]
                           ↓
              ┌─────────────────────────────┐
              │   Upstream Connection Pool  │
              │                             │
              │  Key: serverId + userId     │
              │  Value: MCP Client instance │
              │                             │
              │  - Lazy initialization      │
              │  - Health checking          │
              │  - TTL-based expiration     │
              │  - Graceful reconnection    │
              └─────────────────────────────┘
```

## Key Design Decisions

### 1. Pool Key Strategy

Pool connections by `serverId + userId`:

```typescript
interface PoolKey {
  serverId: string;
  workspaceId: string;
  userId: string;  // From gateway token - important for user-specific upstream auth
}

function getPoolKey(config: ServerConfig, gatewayToken: any): string {
  return `${config.workspaceId}:${config.serverId}:${gatewayToken?.username || 'anonymous'}`;
}
```

**Why include userId?**
- Upstream servers may have user-specific OAuth tokens
- User identity forwarding means different users get different upstream behavior
- Prevents cross-user data leakage

### 2. Connection Lifecycle

```typescript
class UpstreamConnectionPool {
  private connections = new Map<string, PooledConnection>();
  
  async getConnection(
    config: ServerConfig,
    gatewayToken: any,
    context: Context
  ): Promise<Upstream> {
    const key = this.getPoolKey(config, gatewayToken);
    
    let conn = this.connections.get(key);
    
    // Check if connection is valid
    if (conn && conn.isHealthy() && !conn.isExpired()) {
      conn.touch(); // Update last activity
      return conn.upstream;
    }
    
    // Create new connection
    const upstream = new Upstream(config, ...);
    await upstream.connect();
    
    conn = new PooledConnection(upstream, key);
    this.connections.set(key, conn);
    
    return upstream;
  }
}
```

### 3. Health Checking

Connections can become stale if:
- Upstream server restarts
- Network issues
- Upstream session expires

```typescript
class PooledConnection {
  private lastActivity: number;
  private healthCheckInterval: number = 30_000; // 30 seconds
  
  isHealthy(): boolean {
    // Check if client transport is still connected
    if (!this.upstream.client?.transport) return false;
    
    // Optionally ping upstream
    // But avoid adding latency to hot path
    return true;
  }
  
  async healthCheck(): Promise<boolean> {
    try {
      await this.upstream.ping();
      return true;
    } catch {
      return false;
    }
  }
}
```

### 4. TTL and Expiration

```typescript
const POOL_CONFIG = {
  maxIdleTime: 5 * 60 * 1000,    // 5 minutes idle → close
  maxLifetime: 30 * 60 * 1000,   // 30 minutes max lifetime
  healthCheckInterval: 30_000,   // Health check every 30s
  maxConnectionsPerKey: 1,       // One connection per user+server
  maxTotalConnections: 1000,     // Total pool limit
};
```

### 5. Graceful Reconnection

When a connection fails mid-request:

```typescript
async handleRequest(request: JSONRPCRequest): Promise<void> {
  try {
    const result = await this.upstream.callTool(request.params);
    await this.downstream.sendResult(request.id, result);
  } catch (error) {
    if (this.isConnectionError(error)) {
      // Mark connection as unhealthy
      this.pool.markUnhealthy(this.poolKey);
      
      // Retry with new connection (once)
      const newUpstream = await this.pool.getConnection(...);
      const result = await newUpstream.callTool(request.params);
      await this.downstream.sendResult(request.id, result);
    } else {
      throw error;
    }
  }
}
```

## Implementation Plan

### Phase 1: Basic Connection Pool

1. Create `UpstreamConnectionPool` class
2. Pool by `serverId + workspaceId + userId`
3. Implement `getConnection()` with lazy initialization
4. Add TTL-based expiration
5. Background cleanup of expired connections

### Phase 2: Health and Reliability

1. Add health checking (periodic ping)
2. Implement graceful reconnection on failure
3. Add connection metrics (hits, misses, errors)
4. Handle upstream OAuth token expiration

### Phase 3: Advanced Features

1. Connection warming (pre-create connections for known servers)
2. Circuit breaker for failing upstreams
3. Load balancing across multiple upstream instances (if applicable)
4. Distributed pool (Redis-backed) for multi-instance gateway

## File Changes Required

### New Files
- `src/mcp/services/upstreamConnectionPool.ts` - Pool implementation

### Modified Files
- `src/mcp/handlers/mcpHandler.ts` - Use pool instead of creating new connections
- `src/mcp/services/mcpSession.ts` - Accept pooled upstream client

### Unchanged
- `src/mcp/services/upstream.ts` - Still handles the actual MCP client logic

## Performance Impact

| Scenario | Current | With Pool |
|----------|---------|-----------|
| First request | 1-4 RTT | 1-4 RTT |
| Subsequent requests (same user+server) | 1-4 RTT | **~0 RTT overhead** |
| Different user, same server | 1-4 RTT | 1-4 RTT |
| Connection expired | N/A | 1-4 RTT |

**Expected improvement:** 50-200ms latency reduction for repeat requests to the same upstream server.

## Reference Implementation

See Hoot's connection pool for a simpler in-memory implementation:
- `~/workspace/hoot/server/lib/connection-pool.js` - Abstract interface
- `~/workspace/hoot/server/adapters/connection-pool-node.js` - Node.js Map-based implementation

Key differences from Hoot:
1. We need to key by user (for OAuth/identity)
2. We need to handle more complex auth scenarios (OAuth auto-discovery)
3. We may need distributed pooling for horizontal scaling

## Testing Strategy

1. **Unit tests**: Pool lifecycle, expiration, health checking
2. **Integration tests**: Real upstream MCP servers
3. **Load tests**: Measure latency improvement under load
4. **Failure tests**: Upstream disconnection, OAuth expiration

## Rollout Plan

1. Implement behind feature flag
2. A/B test with metrics comparison
3. Gradual rollout with monitoring
4. Full enablement after validation

## Metrics to Track

- `mcp.pool.hit` - Connection reused from pool
- `mcp.pool.miss` - New connection created
- `mcp.pool.size` - Current pool size
- `mcp.pool.eviction` - Connection evicted (TTL, health)
- `mcp.upstream.connect_time` - Time to establish new connection
- `mcp.request.latency` - End-to-end request latency

## Open Questions

1. **Distributed pooling**: Do we need Redis-backed pool for multi-instance gateway?
2. **Connection limits**: What's the right max pool size?
3. **Upstream session management**: How do we handle `Mcp-Session-Id` from upstream?
4. **OAuth token refresh**: How do we handle upstream token expiration gracefully?

---

*Created: December 2024*
*Status: Planned - to be implemented in a separate branch*

