# Session Persistence

The MCP Gateway now supports persistent session storage to prevent session loss during server restarts.

## Features

- **JSON File Storage**: Sessions are stored in a JSON file by default
- **Redis Ready**: Interface designed for easy migration to Redis
- **Automatic Recovery**: Sessions are restored on server startup
- **Graceful Shutdown**: Sessions saved on SIGINT/SIGTERM
- **Periodic Persistence**: Sessions saved every 30 seconds

## Configuration

Environment variables:
- `SESSION_DATA_DIR`: Directory for session storage (default: `./data`)

## Session Data Structure

```json
{
  "id": "session-uuid",
  "serverId": "linear",
  "createdAt": 1234567890,
  "lastActivity": 1234567890,
  "isInitialized": true,
  "clientTransportType": "sse",
  "transportCapabilities": {
    "clientTransport": "sse",
    "upstreamTransport": "streamable-http"
  },
  "metrics": {
    "requests": 10,
    "toolCalls": 5,
    "errors": 0
  },
  "config": {
    "serverId": "linear",
    "url": "https://mcp.linear.app/sse",
    "headers": {...}
  }
}
```

## Migration to Redis

To migrate to Redis, implement the `RedisSessionStore` interface:

```typescript
const redisStore = new RedisSessionStoreImpl({
  host: 'redis.example.com',
  port: 6379
});
```

## Benefits

1. **No Session Loss**: Client connections survive server restarts
2. **Better Reliability**: Sessions persist across deployments
3. **Automatic Recovery**: Sessions are automatically reinitialized on restoration
4. **Initialization State**: Tracks whether sessions are properly initialized
5. **Monitoring**: Session metrics are preserved
6. **Scalability**: Easy migration path to Redis for multi-instance deployments

## Session Initialization

The system now tracks session initialization state:

- **New Sessions**: Created and initialized when clients connect
- **Restored Sessions**: Automatically reinitialize transport connections
- **Failed Restoration**: Sessions that can't be restored are marked as uninitialized
- **Cleanup**: Uninitialized sessions are removed when accessed

This prevents the "Session not initialized" errors that occurred with simple session restoration.
