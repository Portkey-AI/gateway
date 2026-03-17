# MCP Gateway

A Model Context Protocol (MCP) gateway that proxies requests to upstream MCP servers. The gateway provides authentication, session management, and OAuth token handling.

## Features

- **URL-based routing**: Connect to any MCP server via URL parameter
- **API Key authentication**: Secure access with `x-portkey-api-key` header
- **Presigned URLs**: Generate time-limited URLs that don't require API keys
- **Bundle support**: Create bundles of multiple MCP servers for easy distribution
- **OAuth support**: Automatic OAuth token management and refresh
- **Session management**: Persistent sessions with Redis backend
- **Transport support**: Both SSE and HTTP (Streamable HTTP) transports
- **Tool filtering**: Optional toolkit-based tool filtering

## Quick Start

### Using Docker Compose

```bash
docker compose up -d
```

The gateway will be available at `http://localhost:8787/mcp`

### Endpoints

| Endpoint | Description |
|----------|-------------|
| `/mcp/mcp?url=<base64url>` | Main MCP endpoint (HTTP POST) |
| `/mcp/mcp?url=<base64url>&token=<presigned>` | MCP endpoint with presigned token (no API key needed) |
| `/mcp/sse?url=<base64url>` | SSE endpoint (GET) |
| `/mcp/bundle/:bundleToken` | Get MCP server bundle (returns MCP standard JSON) |
| `/mcp/health` | Health check |
| `/mcp/.well-known/mcp` | MCP protocol discovery |
| `/mcp/.well-known/oauth-authorization-server` | OAuth discovery |
| `/mcp/oauth/authorize?url=<base64url>` | OAuth authorization |

## Usage

### 1. Encode the MCP Server URL

The server URL must be base64url encoded:

```bash
# Example: https://mcp.deepwiki.com/sse
echo -n "https://mcp.deepwiki.com/sse" | base64 -w0 | tr '+/' '-_' | tr -d '='
# Result: aHR0cHM6Ly9tY3AuZGVlcHdpa2kuY29tL3NzZQ
```

### 2. Make MCP Requests

**Initialize:**
```bash
curl -X POST "http://localhost:8787/mcp/mcp?url=aHR0cHM6Ly9tY3AuZGVlcHdpa2kuY29tL3NzZQ" \
  -H "Content-Type: application/json" \
  -H "x-portkey-api-key: your-api-key" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "my-client", "version": "1.0.0"}
    }
  }'
```

**List Tools:**
```bash
curl -X POST "http://localhost:8787/mcp/mcp?url=aHR0cHM6Ly9tY3AuZGVlcHdpa2kuY29tL3NzZQ" \
  -H "Content-Type: application/json" \
  -H "x-portkey-api-key: your-api-key" \
  -H "mcp-session-id: <session-id-from-initialize>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'
```

**Call Tool:**
```bash
curl -X POST "http://localhost:8787/mcp/mcp?url=aHR0cHM6Ly9tY3AuZGVlcHdpa2kuY29tL3NzZQ" \
  -H "Content-Type: application/json" \
  -H "x-portkey-api-key: your-api-key" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "read_wiki_structure",
      "arguments": {"repoName": "facebook/react"}
    }
  }'
```

### 3. Discovery Endpoint

Get gateway capabilities and usage instructions:

```bash
curl http://localhost:8787/mcp/.well-known/mcp
```

Response:
```json
{
  "protocol": "mcp",
  "version": "2024-11-05",
  "gateway": "StringCost MCP Gateway",
  "endpoints": {
    "mcp": "http://localhost:8787/mcp?url={base64url_encoded_server_url}",
    "sse": "http://localhost:8787/sse?url={base64url_encoded_server_url}"
  },
  "transports": ["streamable-http", "sse"],
  "authentication": {
    "types": ["bearer", "api_key"],
    "headers": {
      "api_key": "x-portkey-api-key"
    }
  }
}
```

## Presigned URLs & Bundles

Presigned URLs allow you to share access to MCP servers without exposing your API key. This is perfect for:
- Sharing MCP access with team members
- Configuring Claude Code or other MCP clients
- Creating time-limited access tokens

### Creating Presigned URLs

Use the control plane API to create presigned URLs for one or more MCP servers:

```bash
curl -X POST "https://your-control-plane/v2/mcp-presign" \
  -H "Content-Type: application/json" \
  -H "x-stringcost-api-key: your-api-key" \
  -d '{
    "servers": [
      {
        "name": "deepwiki",
        "url": "https://mcp.deepwiki.com/sse",
        "transport": "sse"
      },
      {
        "name": "github",
        "url": "https://mcp.example.com/github",
        "transport": "sse"
      }
    ],
    "expires_in": 86400,
    "max_uses": -1
  }'
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `servers` | array | Yes | Array of MCP server configurations |
| `servers[].name` | string | Yes | Server name (used as key in mcpServers) |
| `servers[].url` | string | Yes | MCP server URL |
| `servers[].transport` | string | No | Transport type: `sse` or `http` (default: `sse`) |
| `expires_in` | number | No | TTL in seconds (default: 3600, max: 86400) |
| `max_uses` | number | No | Max usage count (-1 for unlimited) |
| `cost_limit` | number | No | Cost limit in microdollars |
| `user_id` | string | No | User identifier for tracking |
| `metadata` | object | No | Additional metadata |

**Response:**

```json
{
  "bundle_url": "https://gateway.example.com/mcp/bundle/abc123xyz",
  "bundle_token": "abc123xyz",
  "expires_at": 1702944000,
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "servers": {
    "deepwiki": {
      "url": "https://gateway.example.com/mcp/mcp?url=aHR0cHM6...&token=eyJw...",
      "original_url": "https://mcp.deepwiki.com/sse",
      "transport": "sse"
    },
    "github": {
      "url": "https://gateway.example.com/mcp/mcp?url=aHR0cHM6...&token=eyJw...",
      "original_url": "https://mcp.example.com/github",
      "transport": "sse"
    }
  }
}
```

### Using with Claude Code

#### Option 1: Bundle URL (Recommended)

The bundle URL returns MCP servers in the standard format that Claude Code expects:

```bash
# Get the bundle JSON
curl https://gateway.example.com/mcp/bundle/abc123xyz
```

Returns:
```json
{
  "mcpServers": {
    "deepwiki": {
      "url": "https://gateway.example.com/mcp/mcp?url=aHR0cHM6...&token=eyJw...",
      "transport": "sse"
    },
    "github": {
      "url": "https://gateway.example.com/mcp/mcp?url=aHR0cHM6...&token=eyJw...",
      "transport": "sse"
    }
  }
}
```

To use with Claude Code, save this to your `~/.claude/claude_desktop_config.json` or use the `--mcp-config` flag:

```bash
# Download bundle config
curl -s https://gateway.example.com/mcp/bundle/abc123xyz > mcp-config.json

# Use with Claude Code
claude --mcp-config mcp-config.json
```

Or manually add to your Claude Code config:

```json
{
  "mcpServers": {
    "deepwiki": {
      "url": "https://gateway.example.com/mcp/mcp?url=aHR0cHM6Ly9tY3AuZGVlcHdpa2kuY29tL3NzZQ&token=eyJwIjoiZXlK...",
      "transport": "sse"
    }
  }
}
```

#### Option 2: Individual Presigned URLs

You can also use individual presigned URLs directly. The URL includes everything needed for authentication:

```
https://gateway.example.com/mcp/mcp?url=<base64url>&token=<presigned_token>
```

No API key header is required when using presigned URLs.

### Presigned URL Benefits

1. **No API Key Exposure**: The token contains encrypted authorization
2. **Time-Limited**: URLs automatically expire after the specified TTL
3. **Usage Limits**: Optionally limit the number of uses
4. **Cost Controls**: Set spending limits per presigned URL
5. **Easy Sharing**: Share a single bundle URL for multiple MCP servers

### Security Considerations

- Presigned tokens use HMAC-SHA256 signatures
- Tokens include expiration timestamps that are cryptographically verified
- Bundle tokens are short random strings (for URL readability)
- Individual server tokens contain full authorization context
- Usage is tracked via the `signed_url_sessions` table

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8787` |
| `LOG_LEVEL` | Log level (debug, info, warn, error) | `info` |
| `REDIS_URL` | Redis connection string | (local memory) |
| `MCP_SESSION_SECRET` | Secret for OAuth state signing | (required for OAuth) |
| `MCP_OAUTH_REQUIRED` | Require OAuth for all requests | `true` |
| `MCP_MOCK_MODE` | Enable mock mode (no control plane) | `false` |
| `ADAPTER_TOKEN_SECRET` | Secret for presigned token signing | (required for presigned URLs) |

### Docker Compose Example

```yaml
version: '3'
services:
  gateway:
    build: .
    ports:
      - "8787:8787"
    environment:
      - PORT=8787
      - LOG_LEVEL=debug
      - MCP_SESSION_SECRET=your-secret-key
      - MCP_OAUTH_REQUIRED=false
      - REDIS_URL=redis://redis:6379
      - MCP_MOCK_MODE=true
      - ADAPTER_TOKEN_SECRET=your-presign-secret-key
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Gateway                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Client Request                                                  │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────┐                                            │
│  │ URL Validation  │  Extract & decode base64url server URL     │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                            │
│  │ Auth Middleware │  Validate API key or OAuth token           │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                            │
│  │ Hydrate Context │  Build server config, fetch OAuth tokens   │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐     ┌──────────────────┐                   │
│  │ Session Manager │────▶│  Redis Cache     │                   │
│  └────────┬────────┘     └──────────────────┘                   │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                            │
│  │    Upstream     │  Connect to MCP server (SSE/HTTP)          │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│     MCP Server                                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Concepts

### URL-based Routing

Instead of using path parameters like `/:workspaceId/:serverId`, the gateway uses a URL query parameter:

```
/mcp?url=<base64url_encoded_server_url>
```

This allows connecting to any MCP server without pre-configuration.

### Token Storage

OAuth tokens are stored using the combination of:
- **API Key** (hashed for security)
- **Server URL** (normalized)

Cache key format: `{apiKeyHash}::{normalizedServerUrl}`

### Session Management

Sessions are keyed by:
- **API Key Hash**: Truncated SHA256 hash of the API key
- **Server URL**: Normalized URL (lowercase hostname, no trailing slash)

Sessions are stored in Redis (if configured) or in-memory.

## API Reference

### Headers

| Header | Required | Description |
|--------|----------|-------------|
| `x-portkey-api-key` | Yes* | API key for authentication |
| `Authorization` | Yes* | Bearer token (alternative to API key) |
| `Content-Type` | Yes | `application/json` |
| `mcp-session-id` | No | Session ID for request continuity |

*Either `x-portkey-api-key` or `Authorization: Bearer` is required.

### Query Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `url` | Yes | Base64url-encoded MCP server URL |
| `toolkit` | No | Toolkit ID for tool filtering |

### Response Headers

| Header | Description |
|--------|-------------|
| `mcp-session-id` | Session ID for subsequent requests |

## Error Handling

The gateway returns standard JSON-RPC 2.0 error responses:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32600,
    "message": "Invalid Request"
  }
}
```

HTTP status codes:
- `400` - Bad request (invalid URL, missing parameters)
- `401` - Unauthorized (missing or invalid API key)
- `403` - Forbidden (tool not allowed)
- `404` - Not found (endpoint not found)
- `500` - Internal server error

## Development

### Running Locally

```bash
# Install dependencies
npm install

# Build
npm run build

# Start with Node.js
npm run start:node
```

### Testing

```bash
# Run tests
npm run test:gateway
```

## License

MIT
