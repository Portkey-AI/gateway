# MCP Gateway Technical Specification

## Overview

The Portkey MCP Gateway is a full-featured proxy and management layer for Model Context Protocol (MCP) servers. It provides authentication, authorization, session management, tool call logging, and transparent proxying between downstream clients and upstream MCP servers.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MCP Gateway Architecture                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐         ┌─────────────────────────────────┐              │
│   │  MCP Client │◄───────►│        MCP Gateway              │              │
│   │  (Claude,   │         │                                 │              │
│   │   Cursor,   │  HTTP/  │  ┌─────────────────────────┐    │   ┌────────┐ │
│   │   etc.)     │  SSE    │  │     MCPSession          │    │   │Upstream│ │
│   └─────────────┘         │  │  ┌────────┬──────────┐  │◄───┼──►│  MCP   │ │
│                           │  │  │Downstream│ Upstream│  │    │   │ Server │ │
│                           │  │  │Transport │Transport│  │    │   └────────┘ │
│                           │  │  └────────┴──────────┘  │    │              │
│                           │  └─────────────────────────┘    │              │
│                           │                                 │              │
│                           │  ┌─────────────────────────┐    │              │
│                           │  │    Middleware Chain     │    │              │
│                           │  │  • OAuth / API Key Auth │    │              │
│                           │  │  • JWT Validation       │    │              │
│                           │  │  • Hydrate Context      │    │              │
│                           │  │  • Control Plane        │    │              │
│                           │  └─────────────────────────┘    │              │
│                           │                                 │              │
│                           │  ┌─────────────────────────┐    │              │
│                           │  │   Supporting Services   │    │              │
│                           │  │  • Session Store        │    │              │
│                           │  │  • Cache (Redis/Memory) │    │              │
│                           │  │  • Logging (Winky)      │    │              │
│                           │  └─────────────────────────┘    │              │
│                           └─────────────────────────────────┘              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Entry Point (`mcp-index.ts`)

The main Hono application that bootstraps the gateway:

- **CORS Configuration**: Allows browser-based MCP clients with proper headers (`Authorization`, `mcp-session-id`, `mcp-protocol-version`)
- **Redis Initialization**: Waits for Redis client readiness before serving requests
- **Route Mounting**: Mounts OAuth, well-known, and admin route groups
- **Middleware Chain**: Applies authentication and context hydration in order

**Key Endpoints:**
| Endpoint | Description |
|----------|-------------|
| `/:workspaceId/:serverId/mcp` | Main MCP endpoint (HTTP Streamable) |
| `/:serverId/mcp` | Alternative with workspace from token |
| `/:workspaceId/:serverId/sse` | SSE transport endpoint |
| `/:workspaceId/:serverId/messages` | SSE message posting |
| `/oauth/*` | OAuth 2.1 flows |
| `/.well-known/*` | OAuth & JWKS discovery |

---

### 2. Server Configuration (`types/mcp.ts`)

The `ServerConfig` interface defines how upstream MCP servers are configured:

```typescript
interface ServerConfig {
  serverId: string;
  workspaceId: string;
  url: string;                          // Upstream MCP server URL
  headers: Record<string, string>;      // Static auth headers
  passthroughHeaders?: Record<string, string>;  // Headers to always add
  type?: 'http-sse' | 'sse-http' | 'http' | 'sse';  // Transport preference
  
  // Authentication
  auth_type?: 'oauth_auto' | 'oauth_client_credentials' | 'headers';
  
  // Header forwarding from client to upstream
  forwardHeaders?: string[] | { 
    mode: 'allowlist' | 'all-except'; 
    headers: string[] 
  };
  
  // OAuth metadata for upstream servers
  oauth_client_metadata?: Partial<OAuthClientMetadata>;
  oauth_server_metadata?: Partial<OAuthMetadata>;
  
  // Tool policies
  tools?: {
    allowed?: string[];    // Whitelist
    blocked?: string[];    // Blacklist
    rateLimit?: { requests: number; window: number };
    logCalls?: boolean;
  };
  
  // User identity forwarding to upstream
  user_identity_forwarding?: UserIdentityForwardingConfig;
  
  // JWT validation for incoming requests
  jwt_validation?: JwtValidationConfig;
}
```

---

### 3. Middleware Chain

#### 3.1 Control Plane Middleware (`middleware/controlPlane/index.ts`)

Establishes connection to the Portkey Control Plane (Albus) for:
- Fetching MCP server configurations dynamically
- OAuth token introspection
- Dynamic client registration
- Token storage and retrieval

```typescript
class ControlPlane {
  getMCPServer(workspaceId, serverId)     // Fetch server config
  getMCPServerTokens(workspaceId, serverId)  // Get stored OAuth tokens
  saveMCPServerTokens(...)                // Persist tokens
  introspect(token, hint)                 // Token introspection
  authorize(c, oauthStore)                // Start OAuth flow
}
```

#### 3.2 OAuth Middleware (`middleware/oauth/index.ts`)

Implements OAuth 2.1 token validation:
1. Extracts Bearer token from `Authorization` header
2. Checks persistent cache for token introspection result
3. Falls back to Control Plane introspection
4. Caches results for 5 minutes or until expiry
5. Sets `tokenInfo` and `isAuthenticated` in context

Also includes `apiKeyToTokenMapper()` for converting Portkey API key authentication to OAuth-compatible token info format.

#### 3.3 JWT Validation Middleware (`middleware/jwt/index.ts`)

Optional JWT validation for servers requiring it:
- Validates tokens against JWKS or introspection endpoints
- Supports RS256 algorithm
- Validates required claims and claim values
- Merges validated payload into `tokenInfo`

#### 3.4 Context Hydration (`middleware/hydrateContext.ts`)

Loads and caches server configuration:
1. Tries Control Plane first (if available)
2. Falls back to local `servers.json` file
3. Caches configs with 5-minute TTL
4. Sets `serverConfig` in context for handlers

---

### 4. Session Management

#### 4.1 MCPSession (`services/mcpSession.ts`)

The core session class bridging clients and upstream servers:

```typescript
class MCPSession {
  id: string;                    // Unique session ID
  config: ServerConfig;          // Server configuration
  upstream: Upstream;            // Upstream connection
  downstream: Downstream;        // Client-facing transport
  
  // Lifecycle
  async initializeOrRestore(transportType)
  async handleRequest()
  async close()
  
  // Request handling
  handleToolCall(request)        // With validation & logging
  handleToolsList(request)       // With filtering
  handleInitialize(request)      // Protocol initialization
  forwardRequest(request)        // Pass-through for unknown methods
}
```

**Session Status Flow:**
```
New → Initializing → Initialized → Dormant ← (can restore)
                 ↘                      ↓
                  → Closed (terminal)
```

#### 4.2 Session Store (`services/sessionStore.ts`)

Persistent session storage using the unified cache service:

- **Active Sessions**: In-memory Map for fast access
- **Dormant Sessions**: Persisted to cache (Redis or file)
- **Automatic Expiry**: Based on token expiration
- **Session Data**: Serializes session metadata for restoration

---

### 5. Transport Layer

#### 5.1 Upstream (`services/upstream.ts`)

Handles connection to upstream MCP servers:

```typescript
class Upstream {
  client: Client;              // MCP SDK client
  connected: boolean;
  serverCapabilities: any;
  authProvider?: GatewayOAuthProvider;
  
  async connect(): ConnectResult   // Establish connection
  async callTool(params)           // Execute tool
  async listTools()                // Get available tools
  // ... other MCP methods (prompts, resources, etc.)
}
```

**Transport Negotiation:**
- Tries primary transport first (based on config)
- Falls back to secondary if primary fails
- Supports HTTP Streamable and SSE transports

**Header Handling Priority:**
1. Forward headers from client (if configured)
2. Static auth headers from config
3. Passthrough headers from config
4. User identity headers (highest priority)

#### 5.2 Downstream (`services/downstream.ts`)

Handles client-facing transport:

```typescript
class Downstream {
  transport: ServerTransport;
  
  create(type: 'http' | 'sse')
  sendResult(id, result)
  sendError(id, code, message)
  sendAuthError(id, data)
  handleRequest(req, res, body)
}
```

---

### 6. Authentication Flows

#### 6.1 Gateway OAuth Flow

The gateway acts as an OAuth 2.1 authorization server:

```
┌────────┐                    ┌─────────┐                    ┌──────────────┐
│ Client │                    │ Gateway │                    │Control Plane │
└───┬────┘                    └────┬────┘                    └──────┬───────┘
    │  GET /oauth/authorize        │                               │
    │────────────────────────────►│                               │
    │                              │  Authorize Request            │
    │                              │─────────────────────────────►│
    │                              │                               │
    │                              │◄─────────────────────────────│
    │◄────────────────────────────│  Consent Page                 │
    │                              │                               │
    │  POST /oauth/authorize       │                               │
    │────────────────────────────►│                               │
    │                              │  Generate Auth Code           │
    │◄────────────────────────────│                               │
    │  Redirect with code          │                               │
    │                              │                               │
    │  POST /oauth/token           │                               │
    │────────────────────────────►│  Token Request                │
    │                              │─────────────────────────────►│
    │◄────────────────────────────│◄─────────────────────────────│
    │  Access Token                │                               │
```

#### 6.2 Upstream OAuth Flow (`services/upstreamOAuth.ts`)

For MCP servers requiring their own OAuth:

```typescript
class GatewayOAuthProvider implements OAuthClientProvider {
  clientMetadata: OAuthClientMetadata;   // Gateway's client info
  redirectUrl: string;                   // /oauth/upstream-callback
  
  async tokens()                         // Get stored tokens
  async saveTokens(tokens)               // Store new tokens
  async redirectToAuthorization(url)     // Throw auth-required error
  async saveCodeVerifier(verifier)       // PKCE support
}
```

**Upstream Auth Integration:**
1. Gateway detects OAuth requirement during connection
2. Throws `needsAuthorization` error with authorization URL
3. User completes upstream OAuth
4. Gateway exchanges code for tokens via `/oauth/upstream-callback`
5. Tokens stored in Control Plane for reuse

---

### 7. User Identity Forwarding

The gateway can forward authenticated user identity to upstream servers:

#### Methods:
| Method | Description |
|--------|-------------|
| `claims_header` | JSON-encoded claims in `X-User-Claims` header |
| `bearer` | Original OAuth token in `Authorization` header |
| `jwt_header` | Portkey-signed JWT in `X-User-JWT` header |

#### JWT Signing:
- Uses RS256 algorithm with configurable private key
- Key ID derived from RFC 7638 thumbprint
- JWTs cached to avoid signing overhead
- Public key exposed via `/.well-known/jwks.json`

```typescript
interface UserIdentityForwardingConfig {
  method: 'claims_header' | 'bearer' | 'jwt_header';
  include_claims?: string[];           // Claims to forward
  header_name?: string;                // Custom header name
  jwt_expiry_seconds?: number;         // JWT lifetime (default: 300)
}
```

---

### 8. Tool Call Handling & Logging

#### Tool Access Validation:
```typescript
validateToolAccess(toolName): 'blocked' | 'not allowed' | 'invalid' | null
filterTools(tools: Tool[]): Tool[]    // Apply allow/block lists
```

#### Logging (`utils/emitLog.ts`):

Tool calls are logged with rich metadata:

```typescript
{
  'mcp.server.id': serverId,
  'mcp.workspace.id': workspaceId,
  'mcp.transport.client': 'http',
  'mcp.transport.upstream': 'http',
  'mcp.request.method': 'tools/call',
  'mcp.tool.name': toolName,
  'mcp.tool.params': { ... },
  'mcp.tool.result': { ... },
  'mcp.request.success': 'true',
  'mcp.request.duration_ms': 123,
  'organisation_id': '...',
  'workspace_slug': '...',
  'user_id': '...'
}
```

Logs are formatted in OTLP format and forwarded to Winky for analytics.

---

### 9. Well-Known Endpoints

#### OAuth Discovery (`/.well-known/oauth-authorization-server`)
```json
{
  "issuer": "https://mcp.portkey.ai",
  "authorization_endpoint": ".../oauth/authorize",
  "token_endpoint": ".../oauth/token",
  "introspection_endpoint": ".../oauth/introspect",
  "revocation_endpoint": ".../oauth/revoke",
  "registration_endpoint": ".../oauth/register",
  "code_challenge_methods_supported": ["S256"],
  "grant_types_supported": ["authorization_code", "refresh_token", "client_credentials"]
}
```

#### Protected Resource Metadata (`/.well-known/oauth-protected-resource/:workspaceId/:serverId/mcp`)
```json
{
  "resource": ".../workspace/server/mcp",
  "authorization_servers": ["..."],
  "scopes_supported": ["mcp:servers:read", "mcp:tools:list", "mcp:tools:call", "mcp:*"]
}
```

#### JWKS (`/.well-known/jwks.json`)
Returns public key(s) for verifying gateway-signed JWTs.

---

### 10. Header Security

Protected headers that are **never forwarded** from clients:
```typescript
const PROTECTED_HEADERS = [
  'authorization', 'cookie', 'set-cookie',
  'x-api-key', 'x-portkey-api-key', 'api-key', 'apikey',
  'x-auth-token', 'x-access-token',
  'x-user-claims', 'x-user-jwt'  // Prevent spoofing
];
```

---

### 11. Caching Strategy

| Cache | Purpose | TTL |
|-------|---------|-----|
| Config Cache | Server configurations | 5 minutes |
| Token Cache | OAuth introspection results | Min(token expiry, 5 min) |
| Session Cache | Dormant session data | Token expiry |
| JWT Cache | Signed identity JWTs | JWT expiry - 30s |
| JWKS Cache | Public keys for validation | 1 hour |

---

### 12. Error Handling

JSON-RPC error codes used:
| Code | Meaning |
|------|---------|
| -32000 | Session/Authorization errors |
| -32001 | Server config/Session not found |
| -32600 | Invalid Request |

OAuth errors follow RFC 6749:
- `unauthorized`, `invalid_request`, `invalid_grant`, `invalid_client`, `server_error`

---

### 13. Configuration

#### Environment Variables:
| Variable | Description |
|----------|-------------|
| `ALBUS_BASEPATH` | Control Plane URL |
| `MCP_GATEWAY_BASE_URL` | Public gateway URL |
| `MCP_PORT` | Gateway port (default: 3000) |
| `REDIS_URL` | Redis connection string |
| `JWT_PRIVATE_KEY` | PEM-encoded RS256 private key |
| `SERVERS_CONFIG_PATH` | Path to local servers.json |

#### Local Server Config (`data/servers.json`):
```json
{
  "servers": {
    "workspace/server": {
      "url": "https://upstream-mcp.example.com/mcp",
      "headers": { "Authorization": "Bearer ..." },
      "auth_type": "headers",
      "tools": { "allowed": ["tool1", "tool2"] }
    }
  }
}
```

---

## Request Flow Example

1. **Client Request** → `POST /:workspaceId/:serverId/mcp`
2. **Auth Middleware** → Validates OAuth token or API key
3. **Context Hydration** → Loads server config from cache/Control Plane
4. **JWT Middleware** → Optional additional JWT validation
5. **Handler** → Creates/restores MCPSession
6. **Session** → Connects upstream if needed
7. **Tool Call** → Validates access, forwards to upstream
8. **Logging** → Emits OTLP log with metrics
9. **Response** → Returns result to client

---

## Security Considerations

1. **OAuth 2.1 with PKCE** required for public clients
2. **Token introspection** validates every request
3. **Protected headers** prevent client spoofing
4. **Upstream OAuth isolation** per user/workspace
5. **JWT signing** for secure identity forwarding
6. **Tool whitelisting/blacklisting** per server
7. **Rate limiting** support per tool

