# MCP Gateway Manual Test Guide

This document provides a comprehensive list of manual test cases for the MCP Gateway, organized by functional area.

---

## Prerequisites

Before testing, ensure you have:
1. MCP Gateway running locally or in a test environment
2. Valid Portkey API key or OAuth credentials
3. Access to at least one upstream MCP server (or use mock servers)
4. HTTP client (Postman, curl, or similar)
5. MCP-compatible client (optional but recommended for protocol tests)

**Base URLs:**
- Gateway: `http://localhost:3000` (or your configured `MCP_GATEWAY_BASE_URL`)
- Endpoints pattern: `/:workspaceId/:serverId/mcp` or `/:serverId/mcp`

---

## 1. Health & Basic Connectivity

### 1.1 Health Check Endpoints

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 1.1.1 | Health endpoint responds | `GET /health` | Returns `200` with `{"status": "healthy", "timestamp": "..."}` | Critical |
| 1.1.2 | V1 Health endpoint | `GET /v1/health` | Returns `200` with same health response | High |
| 1.1.3 | Root endpoint shows gateway info | `GET /` | Returns `200` with gateway version and endpoint documentation | Medium |
| 1.1.4 | Unknown route returns 404 | `GET /nonexistent` | Returns `404` with `{"status": "not found"}` | Medium |

### 1.2 CORS Configuration

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 1.2.1 | CORS headers present | Send request with `Origin` header | Response includes `Access-Control-Allow-Origin` | High |
| 1.2.2 | Preflight OPTIONS request | `OPTIONS /:workspaceId/:serverId/mcp` with CORS headers | Returns `204` with allowed methods and headers | High |
| 1.2.3 | Custom headers allowed | Check `Access-Control-Allow-Headers` | Includes `mcp-session-id`, `mcp-protocol-version`, `Authorization` | High |
| 1.2.4 | Exposed headers | Check `Access-Control-Expose-Headers` | Includes `mcp-session-id`, `WWW-Authenticate` | Medium |

---

## 2. Authentication

### 2.1 API Key Authentication

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 2.1.1 | Valid API key grants access | Send request with valid `x-portkey-api-key` header | Request proceeds successfully | Critical |
| 2.1.2 | Missing API key returns 401 | Send request without any auth headers | Returns `401` with `WWW-Authenticate` header | Critical |
| 2.1.3 | Invalid API key returns 401 | Send request with invalid `x-portkey-api-key` | Returns `401 unauthorized` | Critical |
| 2.1.4 | Malformed API key rejected | Send request with garbage value | Returns `401` error | High |
| 2.1.5 | API key maps to tokenInfo | Check internal context after auth | `tokenInfo` contains `workspace_id`, `organisation_id` | Medium |
| 2.1.6 | Workspace mismatch rejected | API key for workspace A, access workspace B | Returns `403 forbidden` | Critical |

### 2.2 OAuth Token Authentication

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 2.2.1 | Valid Bearer token grants access | `Authorization: Bearer <valid_token>` | Request proceeds successfully | Critical |
| 2.2.2 | Missing Bearer token returns 401 | No `Authorization` header | Returns `401` with resource metadata URL | Critical |
| 2.2.3 | Invalid Bearer token returns 401 | `Authorization: Bearer invalid_token` | Returns `401` with error description | Critical |
| 2.2.4 | Expired token returns 401 | Use an expired OAuth token | Returns `401 "token is invalid or expired"` | Critical |
| 2.2.5 | Token introspection caching | Make same request twice quickly | Second request uses cached introspection | Medium |
| 2.2.6 | Cache expires correctly | Wait >5 minutes, make request | Token is re-introspected | Low |

### 2.3 Authorization Scopes

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 2.3.1 | MCP invoke scope required | Check auth middleware scope check | `MCP.INVOKE` scope verified | High |
| 2.3.2 | Insufficient scope rejected | Token without required scope | Returns `403` or appropriate error | High |

---

## 3. OAuth 2.1 Flow

### 3.1 OAuth Discovery

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 3.1.1 | OAuth discovery endpoint | `GET /.well-known/oauth-authorization-server` | Returns RFC 8414 compliant metadata | High |
| 3.1.2 | Discovery has correct endpoints | Check response fields | Contains `authorization_endpoint`, `token_endpoint`, `introspection_endpoint`, `revocation_endpoint`, `registration_endpoint` | High |
| 3.1.3 | PKCE supported | Check `code_challenge_methods_supported` | Contains `["S256"]` | High |
| 3.1.4 | Grant types listed | Check `grant_types_supported` | Contains `authorization_code`, `refresh_token`, `client_credentials` | Medium |
| 3.1.5 | Server-specific discovery | `GET /.well-known/oauth-authorization-server/:workspaceId/:serverId/mcp` | Returns server-specific metadata | Medium |
| 3.1.6 | Discovery caching | Check `Cache-Control` header | Has appropriate max-age | Low |

### 3.2 Protected Resource Metadata

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 3.2.1 | Protected resource endpoint | `GET /.well-known/oauth-protected-resource/:workspaceId/:serverId/mcp` | Returns RFC 9728 compliant metadata | High |
| 3.2.2 | Resource URL correct | Check `resource` field | Matches MCP endpoint URL | High |
| 3.2.3 | Scopes listed | Check `scopes_supported` | Contains MCP scopes (`mcp:tools:list`, `mcp:tools:call`, etc.) | Medium |
| 3.2.4 | SSE resource metadata | `GET /.well-known/oauth-protected-resource/:workspaceId/:serverId/sse` | Returns SSE endpoint metadata | Medium |

### 3.3 Dynamic Client Registration

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 3.3.1 | Register new client | `POST /oauth/register` with client metadata | Returns `201` with client credentials | High |
| 3.3.2 | Missing required fields | Register without `redirect_uris` | Returns appropriate error | Medium |
| 3.3.3 | Invalid redirect URI rejected | Register with `http://` (non-HTTPS) URI | Rejected or warning | Medium |

### 3.4 Authorization Flow

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 3.4.1 | Authorization endpoint accessible | `GET /oauth/authorize?client_id=...&redirect_uri=...&response_type=code&code_challenge=...&code_challenge_method=S256` | Shows consent page or redirects | High |
| 3.4.2 | Missing parameters rejected | `GET /oauth/authorize` without params | Returns error | High |
| 3.4.3 | Server-specific authorize | `GET /oauth/:workspaceId/:serverId/authorize` | Works for specific server | Medium |
| 3.4.4 | Consent submission | `POST /oauth/authorize` with approval | Redirects with authorization code | High |
| 3.4.5 | PKCE required | Attempt auth without code_challenge | Rejected per MCP spec | High |

### 3.5 Token Exchange

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 3.5.1 | Exchange code for token | `POST /oauth/token` with grant_type=authorization_code | Returns access_token | Critical |
| 3.5.2 | Refresh token works | `POST /oauth/token` with grant_type=refresh_token | Returns new access_token | High |
| 3.5.3 | Client credentials grant | `POST /oauth/token` with grant_type=client_credentials | Returns access_token | Medium |
| 3.5.4 | Invalid code rejected | Use already-used or invalid code | Returns `401` invalid_grant | High |
| 3.5.5 | PKCE verifier required | Exchange without code_verifier | Rejected | High |
| 3.5.6 | Wrong verifier rejected | Exchange with wrong code_verifier | Rejected | High |

### 3.6 Token Introspection

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 3.6.1 | Introspect active token | `POST /oauth/introspect` with active token | Returns `{"active": true, ...}` | High |
| 3.6.2 | Introspect expired token | `POST /oauth/introspect` with expired token | Returns `{"active": false}` | High |
| 3.6.3 | Introspect revoked token | `POST /oauth/introspect` with revoked token | Returns `{"active": false}` | Medium |
| 3.6.4 | form-urlencoded body | Content-Type: application/x-www-form-urlencoded | Works correctly | Medium |
| 3.6.5 | JSON body | Content-Type: application/json | Works correctly | Medium |

### 3.7 Token Revocation

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 3.7.1 | Revoke access token | `POST /oauth/revoke` with token | Returns `200` (always per RFC 7009) | Medium |
| 3.7.2 | Revoked token unusable | Use revoked token for request | Returns `401` | High |
| 3.7.3 | Revoke refresh token | `POST /oauth/revoke` with refresh_token | Returns `200` | Medium |
| 3.7.4 | Invalid token returns 200 | Revoke nonexistent token | Returns `200` (per RFC 7009) | Low |

### 3.8 Upstream OAuth Flow

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 3.8.1 | Upstream auth redirect | Access server requiring upstream OAuth | Returns authorization URL in error | High |
| 3.8.2 | Upstream auth initiation | `GET /oauth/upstream-auth` | Redirects to upstream provider | Medium |
| 3.8.3 | Upstream callback success | `GET /oauth/upstream-callback?code=...&state=...` | Completes auth, shows success page | High |
| 3.8.4 | Upstream callback error | Callback with error parameter | Shows error page with description | Medium |
| 3.8.5 | Tokens stored for reuse | After upstream auth, make request | Works without re-auth | High |

---

## 4. MCP Protocol Operations

### 4.1 Session Initialization

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 4.1.1 | Initialize succeeds | Send `{"jsonrpc":"2.0","method":"initialize","params":{...},"id":1}` | Returns protocol version and capabilities | Critical |
| 4.1.2 | Session ID returned | Check response headers | Contains `mcp-session-id` | High |
| 4.1.3 | Server capabilities included | Check initialize response | Contains upstream server capabilities | High |
| 4.1.4 | Gateway server info | Check `serverInfo` field | Shows "portkey-mcp-gateway" | Medium |
| 4.1.5 | Session reuse | Use session ID for subsequent requests | Session is reused | High |

### 4.2 Ping/Pong

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 4.2.1 | Ping responds | Send `{"jsonrpc":"2.0","method":"ping","id":2}` after init | Returns empty result | Medium |
| 4.2.2 | Ping without init | Send ping before initialize | Still works (upstream handles) | Low |

### 4.3 Tools Operations

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 4.3.1 | List tools | Send `tools/list` request | Returns array of available tools | Critical |
| 4.3.2 | Call tool successfully | Send `tools/call` with valid tool name and params | Returns tool result | Critical |
| 4.3.3 | Call tool with arguments | Send `tools/call` with complex arguments | Arguments passed correctly | High |
| 4.3.4 | Tool not found | Call non-existent tool | Returns appropriate error | High |
| 4.3.5 | Tool execution error | Call tool that fails upstream | Error propagated correctly | High |
| 4.3.6 | Tool call logging | Make tool call, check logs | Call logged with metadata | Medium |

### 4.4 Prompts Operations

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 4.4.1 | List prompts | Send `prompts/list` request | Returns available prompts | Medium |
| 4.4.2 | Get specific prompt | Send `prompts/get` with prompt name | Returns prompt details | Medium |
| 4.4.3 | Get prompt with arguments | Send `prompts/get` with arguments | Prompt rendered with args | Medium |

### 4.5 Resources Operations

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 4.5.1 | List resources | Send `resources/list` request | Returns available resources | Medium |
| 4.5.2 | List resource templates | Send `resources/templates/list` | Returns templates | Medium |
| 4.5.3 | Read resource | Send `resources/read` with URI | Returns resource contents | Medium |
| 4.5.4 | Subscribe to resource | Send `resources/subscribe` | Subscription acknowledged | Low |
| 4.5.5 | Unsubscribe from resource | Send `resources/unsubscribe` | Unsubscription acknowledged | Low |

### 4.6 Completion Operations

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 4.6.1 | Complete request | Send `completion/complete` | Returns completion result | Low |

### 4.7 Logging Operations

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 4.7.1 | Set logging level | Send `logging/setLevel` with level | Level changed | Low |

---

## 5. Tool Policies

### 5.1 Tool Allowlist

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 5.1.1 | Only allowed tools returned | Configure `tools.allowed: ["tool1"]`, list tools | Only "tool1" in response | Critical |
| 5.1.2 | Call allowed tool | Call tool in allowlist | Succeeds | High |
| 5.1.3 | Call non-allowed tool | Call tool not in allowlist | Returns error "tool is not allowed" | Critical |
| 5.1.4 | Empty allowlist blocks all | `tools.allowed: []` | No tools available | Medium |

### 5.2 Tool Blocklist

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 5.2.1 | Blocked tools hidden | Configure `tools.blocked: ["dangerous"]`, list tools | "dangerous" not in response | Critical |
| 5.2.2 | Call blocked tool | Call blocked tool directly | Returns error "tool is blocked" | Critical |
| 5.2.3 | Unblocked tools work | Call non-blocked tool | Succeeds normally | High |

### 5.3 Combined Allow/Block

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 5.3.1 | Block takes precedence | Tool in both allowed and blocked | Tool is blocked | High |
| 5.3.2 | Only intersection visible | Set both lists | Only allowed minus blocked visible | Medium |

---

## 6. Header Forwarding

### 6.1 Static Headers

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 6.1.1 | Config headers forwarded | Configure `headers: {"X-Custom": "value"}` | Upstream receives header | High |
| 6.1.2 | Passthrough headers added | Configure `passthroughHeaders` | Headers added to all requests | High |

### 6.2 Dynamic Header Forwarding (Allowlist Mode)

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 6.2.1 | Forward specific headers | Configure `forwardHeaders: ["X-Tenant-ID"]` | Only X-Tenant-ID forwarded | High |
| 6.2.2 | Non-listed headers dropped | Send X-Other header | Header not forwarded | High |
| 6.2.3 | Case insensitive matching | Send `x-tenant-id` (lowercase) | Still forwarded | Medium |

### 6.3 Dynamic Header Forwarding (All-Except Mode)

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 6.3.1 | All headers forwarded | `forwardHeaders: {mode: "all-except", headers: []}` | Most headers forwarded | Medium |
| 6.3.2 | Exceptions excluded | `forwardHeaders: {mode: "all-except", headers: ["X-Skip"]}` | X-Skip not forwarded | Medium |
| 6.3.3 | Security blocklist still applies | Send Authorization header | Not forwarded (security) | Critical |

### 6.4 Protected Headers (Security)

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 6.4.1 | Authorization never forwarded | Client sends `Authorization` | NOT passed to upstream | Critical |
| 6.4.2 | Cookie never forwarded | Client sends `Cookie` | NOT passed to upstream | Critical |
| 6.4.3 | x-api-key never forwarded | Client sends `x-api-key` | NOT passed to upstream | Critical |
| 6.4.4 | x-portkey-api-key never forwarded | Client sends gateway API key | NOT passed to upstream | Critical |
| 6.4.5 | x-user-claims never forwarded | Client tries to spoof claims | Blocked, NOT forwarded | Critical |
| 6.4.6 | x-user-jwt never forwarded | Client tries to spoof JWT | Blocked, NOT forwarded | Critical |

---

## 7. User Identity Forwarding

### 7.1 Claims Header Mode

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 7.1.1 | Claims forwarded | Configure `user_identity_forwarding: {method: "claims_header"}` | Upstream receives `X-User-Claims` header | High |
| 7.1.2 | Claims JSON encoded | Check header value | Valid JSON with user claims | High |
| 7.1.3 | Include only specific claims | Set `include_claims: ["sub", "email"]` | Only specified claims included | Medium |
| 7.1.4 | Custom header name | Set `header_name: "X-Custom-Claims"` | Uses custom header | Medium |

### 7.2 Bearer Token Mode

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 7.2.1 | Original token forwarded | Configure `user_identity_forwarding: {method: "bearer"}` | Upstream receives original OAuth token | Medium |
| 7.2.2 | Authorization header set | Check upstream request | Has `Authorization: Bearer ...` | Medium |

### 7.3 JWT Header Mode

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 7.3.1 | Signed JWT forwarded | Configure `user_identity_forwarding: {method: "jwt_header"}` | Upstream receives `X-User-JWT` header | Medium |
| 7.3.2 | JWT signature valid | Verify JWT with JWKS | Signature validates | High |
| 7.3.3 | JWT contains claims | Decode JWT | Contains user identity claims | Medium |
| 7.3.4 | JWT expiry set | Check `exp` claim | Expires per config (default 300s) | Medium |
| 7.3.5 | JWKS endpoint works | `GET /.well-known/jwks.json` | Returns public key(s) | Medium |

---

## 8. Transport Layer

### 8.1 HTTP Streamable Transport

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 8.1.1 | POST to /mcp works | `POST /:workspaceId/:serverId/mcp` with JSON-RPC | Returns response | Critical |
| 8.1.2 | Content-Type JSON | Set Content-Type: application/json | Request accepted | High |
| 8.1.3 | GET with session ID | `GET /:workspaceId/:serverId/mcp?sessionId=...` | Works for established session | Medium |

### 8.2 SSE Transport

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 8.2.1 | SSE endpoint accessible | `GET /:workspaceId/:serverId/sse` with Accept: text/event-stream | SSE stream opens | High |
| 8.2.2 | SSE session created | Check response | Session ID provided | High |
| 8.2.3 | POST to messages endpoint | `POST /:workspaceId/:serverId/messages?sessionId=...` | Message delivered | High |
| 8.2.4 | Missing session ID rejected | POST /messages without sessionId | Returns `400` | High |
| 8.2.5 | Unknown session rejected | POST /messages with invalid sessionId | Returns `404` | High |
| 8.2.6 | Non-SSE request rejected | GET /sse without proper Accept header | Returns `400` | Medium |

### 8.3 Transport Fallback

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 8.3.1 | HTTP fallback to SSE | Upstream only supports SSE | Connection established via SSE | Medium |
| 8.3.2 | Preferred transport used | Set `transport.preferred: "http"` | Uses HTTP first | Low |

---

## 9. Session Management

### 9.1 Session Lifecycle

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 9.1.1 | Session created on first request | Send MCP request | New session created | High |
| 9.1.2 | Session reused with session ID | Include mcp-session-id header | Same session used | High |
| 9.1.3 | Session survives across requests | Make multiple requests | Session state preserved | High |
| 9.1.4 | Session expiration | Wait for token to expire | Session marked expired | Medium |
| 9.1.5 | Expired session rejected | Use expired session ID | Returns session expired error | High |

### 9.2 Session Restoration

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 9.2.1 | Dormant session restored | Session goes dormant, then accessed | Restored successfully | Medium |
| 9.2.2 | Restoration failure handled | Corrupt session data | Returns restore failed error | Medium |

### 9.3 Session Cleanup

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 9.3.1 | Session deleted on close | Call close operation | Session removed from store | Low |
| 9.3.2 | Failed init cleans up | Initialization fails | No orphan session left | Medium |

---

## 10. Error Handling

### 10.1 JSON-RPC Errors

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 10.1.1 | Invalid JSON-RPC request | Send malformed JSON | Returns -32600 Invalid Request | High |
| 10.1.2 | Method not found | Call unknown method | Forwarded to upstream or error | Medium |
| 10.1.3 | Invalid params | Call with wrong parameters | Returns appropriate error | Medium |
| 10.1.4 | Internal error | Cause server error | Returns -32000 with message | Medium |

### 10.2 Server Configuration Errors

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 10.2.1 | Server not found | Access unconfigured server | Returns -32001 Server config not found | High |
| 10.2.2 | Session not found | Use invalid session ID | Returns -32001 Session not found | High |

### 10.3 Upstream Errors

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 10.3.1 | Upstream connection failed | Upstream server down | Returns connection error | High |
| 10.3.2 | Upstream timeout | Upstream very slow | Timeout error returned | High |
| 10.3.3 | Upstream auth required | Upstream needs OAuth | Returns -32000 with authorizationUrl | High |
| 10.3.4 | Error propagation | Upstream returns error | Error passed to client | High |

### 10.4 Global Error Handler

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 10.4.1 | HTTPException handled | Trigger HTTP exception | Custom response returned | Medium |
| 10.4.2 | Needs auth error | Trigger upstream auth error | Returns 401 with WWW-Authenticate | High |
| 10.4.3 | Unexpected error | Cause uncaught error | Returns 500 with message | Medium |

---

## 11. Multi-Server / Multi-Workspace

### 11.1 Server Routing

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 11.1.1 | Correct server by serverId | Access `/:workspaceId/serverA/mcp` | Routes to serverA | High |
| 11.1.2 | Different server | Access `/:workspaceId/serverB/mcp` | Routes to serverB | High |
| 11.1.3 | Server isolation | Tool call to serverA | Only serverA tools accessible | High |

### 11.2 Workspace Routing

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 11.2.1 | Correct workspace by workspaceId | Access `/workspaceA/server/mcp` | Uses workspaceA config | High |
| 11.2.2 | Workspace from token | Access `/:serverId/mcp` (no workspace in URL) | Uses workspace from token | High |
| 11.2.3 | Workspace mismatch | Token for workspaceA, access workspaceB | Returns 403 | Critical |

### 11.3 Server Configuration

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 11.3.1 | Config from Control Plane | ALBUS_BASEPATH configured | Fetches config from Control Plane | High |
| 11.3.2 | Fallback to local config | No Control Plane | Uses servers.json | Medium |
| 11.3.3 | Config caching | Make two quick requests | Second uses cached config | Medium |
| 11.3.4 | Cache TTL | Wait >5 minutes | Config refetched | Low |

---

## 12. Logging & Monitoring

### 12.1 Request Logging

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 12.1.1 | Tool calls logged | Make tool call | Log entry created with metadata | Medium |
| 12.1.2 | Log contains identifiers | Check log entry | Has server_id, workspace_id, user_id | Medium |
| 12.1.3 | Log contains timing | Check log entry | Has duration_ms | Medium |
| 12.1.4 | Success/failure logged | Check outcome field | `mcp.request.success` is true/false | Medium |
| 12.1.5 | Tool params logged | Check log entry | Has `mcp.tool.params` | Medium |
| 12.1.6 | Tool result logged | Check log entry | Has `mcp.tool.result` | Medium |

### 12.2 OTLP Format

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 12.2.1 | Logs in OTLP format | Check emitted logs | Follows OTLP structure | Low |
| 12.2.2 | Logs forwarded to Winky | Check Winky ingestion | Logs received | Low |

---

## 13. Caching

### 13.1 Configuration Caching

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 13.1.1 | Server config cached | Access server twice | Second is faster | Medium |
| 13.1.2 | Cache TTL 5 minutes | Wait 5+ minutes | Config refetched | Low |

### 13.2 Token Caching

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 13.2.1 | Token introspection cached | Same token twice | Second skips introspection | Medium |
| 13.2.2 | Cache respects token expiry | Token near expiry | Shorter cache time | Low |

### 13.3 Session Caching

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 13.3.1 | Active sessions in memory | Active session | Fast lookup | Medium |
| 13.3.2 | Dormant sessions persisted | Session goes dormant | Stored in Redis/file | Medium |

---

## 14. Redis Integration

### 14.1 Redis Availability

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 14.1.1 | Waits for Redis ready | Start gateway before Redis | Gateway waits, then proceeds | High |
| 14.1.2 | Works with Redis | Redis running | All caching features work | High |
| 14.1.3 | Fallback without Redis | No REDIS_URL | Uses local cache | Medium |

---

## 15. Security

### 15.1 Input Validation

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 15.1.1 | Invalid JSON rejected | Send invalid JSON body | Returns error | High |
| 15.1.2 | XSS in parameters | Send XSS payload in tool params | Safely handled | High |
| 15.1.3 | SQL injection | Send SQL in parameters | No SQL execution | High |

### 15.2 Header Security

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 15.2.1 | No credential leakage | Check all responses | No auth headers leaked | Critical |
| 15.2.2 | Spoofing prevented | Try to set internal headers | Headers stripped | Critical |

### 15.3 Session Security

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 15.3.1 | Session ID unpredictable | Check session IDs | Random UUIDs used | High |
| 15.3.2 | Cross-session access blocked | Use other user's session ID | Access denied | Critical |

---

## 16. Edge Cases

### 16.1 Concurrent Requests

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 16.1.1 | Parallel requests same session | Fire multiple requests | All handled correctly | Medium |
| 16.1.2 | Parallel init requests | Send multiple inits | Only one session created | Medium |

### 16.2 Large Payloads

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 16.2.1 | Large tool result | Tool returns large data | Response delivered | Medium |
| 16.2.2 | Large tool params | Send large arguments | Request processed | Medium |

### 16.3 Special Characters

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 16.3.1 | Unicode in tool names | Tool with emoji/unicode name | Works correctly | Low |
| 16.3.2 | Special chars in workspace ID | Workspace with special chars | Routed correctly | Medium |

---

## 17. Streaming & Long-Running Operations

### 17.1 Long-Running Tool Calls

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 17.1.1 | Tool call taking 30 seconds | Call slow upstream tool | Response delivered after completion | High |
| 17.1.2 | Tool call taking 60+ seconds | Call very slow tool | Either completes or returns timeout error | High |
| 17.1.3 | Progress during long call | Tool that streams progress | Client receives intermediate updates (if supported) | Medium |
| 17.1.4 | Multiple slow calls in parallel | Fire 5 slow tool calls simultaneously | All complete independently | Medium |
| 17.1.5 | Slow call doesn't block others | One slow call, then fast call | Fast call returns immediately | High |

### 17.2 Streaming Responses

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 17.2.1 | Chunked response handling | Tool returns large chunked response | All chunks received and assembled | High |
| 17.2.2 | Partial response on error | Upstream fails mid-stream | Error returned, partial data handled gracefully | High |
| 17.2.3 | SSE reconnection | SSE connection drops, client reconnects | Session continues without data loss | Medium |
| 17.2.4 | SSE heartbeat/keepalive | Idle SSE connection | Connection stays alive via keepalive | Medium |

### 17.3 Client Disconnect Scenarios

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 17.3.1 | Client disconnects mid-request | Close connection during tool call | Gateway handles gracefully, no crash | Critical |
| 17.3.2 | Client disconnects during init | Close during initialize | No orphan session created | High |
| 17.3.3 | Client timeout before response | Client times out waiting | Gateway doesn't leak resources | High |
| 17.3.4 | Upstream response after client gone | Client disconnected, upstream responds | Response discarded cleanly | Medium |

---

## 18. Resilience & Graceful Degradation

### 18.1 Redis Failure Scenarios

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 18.1.1 | Redis unavailable at startup | Start gateway without Redis | Uses fallback cache, logs warning | High |
| 18.1.2 | Redis goes down mid-operation | Stop Redis during active sessions | Existing sessions continue in-memory | Critical |
| 18.1.3 | Redis reconnection | Redis comes back after outage | Gateway reconnects, resumes caching | High |
| 18.1.4 | Redis slow responses | Add 500ms latency to Redis | Requests still complete (slower) | Medium |
| 18.1.5 | Redis connection timeout | Redis accepts but doesn't respond | Timeout hit, fallback used | High |

### 18.2 Upstream Server Failures

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 18.2.1 | Upstream completely down | Upstream server not running | Returns clear connection error | Critical |
| 18.2.2 | Upstream returns 500 | Upstream has internal error | Error propagated with details | High |
| 18.2.3 | Upstream extremely slow (30s+) | Upstream delays response | Timeout or eventual response | High |
| 18.2.4 | Upstream connection reset | TCP RST from upstream | Clean error, no gateway crash | High |
| 18.2.5 | Upstream SSL/TLS error | Certificate mismatch | Clear TLS error message | Medium |
| 18.2.6 | Upstream DNS failure | Upstream hostname doesn't resolve | DNS error reported | Medium |
| 18.2.7 | Upstream returns malformed JSON | Invalid JSON-RPC response | Error handled, client notified | High |
| 18.2.8 | Upstream returns HTML (wrong endpoint) | 404 HTML page from upstream | Detected as error, not parsed as MCP | Medium |

### 18.3 Network Partition Scenarios

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 18.3.1 | Network timeout to upstream | Block upstream traffic | Timeout error after configured period | High |
| 18.3.2 | Intermittent connectivity | Flaky network to upstream | Retries or clear error | Medium |
| 18.3.3 | One upstream down, others up | Multi-server, one fails | Only affected server returns error | High |

### 18.4 Control Plane Failures

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 18.4.1 | Control Plane unavailable | ALBUS_BASEPATH set but down | Falls back to local config or clear error | High |
| 18.4.2 | Control Plane slow | CP responds in 10+ seconds | Request eventually succeeds or times out | Medium |
| 18.4.3 | Control Plane returns error | CP returns 500 | Error handled, maybe cached config used | Medium |
| 18.4.4 | Control Plane auth failure | Invalid CP credentials | Clear authentication error | High |

---

## 19. OAuth Edge Cases & Negative Tests

### 19.1 Upstream OAuth Failures

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 19.1.1 | Upstream OAuth server down | OAuth discovery fails | Clear error with retry guidance | High |
| 19.1.2 | Upstream OAuth discovery 404 | No .well-known endpoint | Falls back or returns config error | Medium |
| 19.1.3 | Upstream OAuth discovery malformed | Invalid JSON in discovery | Parse error handled | Medium |
| 19.1.4 | Upstream token endpoint fails | Can't exchange code | Authorization flow error | High |
| 19.1.5 | Upstream token expired mid-session | Token expires during use | Re-auth required, clear message | High |
| 19.1.6 | Upstream refresh token fails | Refresh rejected | Re-auth required | High |

### 19.2 Malformed Token Scenarios

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 19.2.1 | Completely random string as token | `Authorization: Bearer asdfghjkl` | Returns 401 invalid token | High |
| 19.2.2 | JWT with invalid signature | Tampered JWT token | Signature validation fails, 401 | Critical |
| 19.2.3 | JWT with wrong algorithm | Token uses 'none' algorithm | Rejected (algorithm confusion attack) | Critical |
| 19.2.4 | JWT with future nbf (not before) | Token not yet valid | Rejected with clear error | Medium |
| 19.2.5 | JWT with missing required claims | Token lacks 'sub' or 'exp' | Rejected | High |
| 19.2.6 | JWT with wrong issuer | Token from different issuer | Rejected | High |
| 19.2.7 | JWT with wrong audience | Token for different service | Rejected | High |
| 19.2.8 | Extremely long token (10KB+) | Send huge Authorization header | Rejected or truncated safely | Medium |
| 19.2.9 | Token with null bytes | Token containing \x00 | Handled safely, no injection | High |
| 19.2.10 | Token with SQL injection attempt | Token value `' OR '1'='1` | No SQL execution, standard rejection | Medium |

### 19.3 OAuth State & PKCE Attacks

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 19.3.1 | Reused authorization code | Use code twice | Second use rejected | Critical |
| 19.3.2 | Authorization code from different client | Client A's code used by Client B | Rejected | Critical |
| 19.3.3 | Mismatched redirect_uri | Token request with different redirect | Rejected | Critical |
| 19.3.4 | PKCE code_verifier brute force | Try many verifiers for one code | All rejected, code eventually expires | High |
| 19.3.5 | State parameter tampering | Modified state in callback | Rejected or detected | High |
| 19.3.6 | CSRF without state | Auth callback without state param | Rejected per OAuth spec | High |

---

## 20. Rate Limiting & Abuse Prevention

### 20.1 Request Rate Limits

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 20.1.1 | Rapid requests same session | 100 requests/second same session | Rate limited or all processed | High |
| 20.1.2 | Rapid requests different sessions | 100 requests/second, new session each | Rate limited by IP or client | High |
| 20.1.3 | Rate limit response format | Exceed rate limit | Returns 429 with Retry-After header | High |
| 20.1.4 | Rate limit per workspace | Hit limit for workspace A | Workspace B unaffected | Medium |
| 20.1.5 | Rate limit recovery | Wait after rate limit | Access restored | High |

### 20.2 Resource Exhaustion Prevention

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 20.2.1 | Many concurrent sessions | Create 1000 sessions rapidly | Limited or handled gracefully | High |
| 20.2.2 | Session creation spam | New session every request | Eventually limited | Medium |
| 20.2.3 | Large request body | Send 100MB request body | Rejected before full read | High |
| 20.2.4 | Slowloris attack | Send headers very slowly | Connection timeout | Medium |
| 20.2.5 | Many SSE connections | Open 100 SSE streams | Limited or managed | Medium |

### 20.3 Authentication Abuse

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 20.3.1 | Brute force API keys | Try 1000 invalid API keys | Rate limited, maybe blocked | Critical |
| 20.3.2 | Brute force OAuth tokens | Try 1000 invalid tokens | Rate limited | Critical |
| 20.3.3 | Password spray attack | Same password, many users | Detected and limited | High |
| 20.3.4 | OAuth client registration spam | Register 100 clients rapidly | Limited | Medium |

---

## 21. Concurrency & Race Conditions

### 21.1 Parallel Request Handling

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 21.1.1 | 10 parallel tool calls | Fire 10 tools/call simultaneously | All complete correctly | High |
| 21.1.2 | 50 parallel tool calls | Fire 50 tools/call simultaneously | All complete or graceful degradation | Medium |
| 21.1.3 | 100 parallel different sessions | 100 requests, each new session | All handled | Medium |
| 21.1.4 | Parallel reads and writes | List tools while calling tool | No race condition | High |

### 21.2 Session Race Conditions

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 21.2.1 | Parallel initialize same session ID | Two inits with same session ID | Only one succeeds or both merge safely | High |
| 21.2.2 | Use session while being created | Request during init | Waits for init or clean error | High |
| 21.2.3 | Delete session while in use | Close session during tool call | Tool call completes or clean error | Medium |
| 21.2.4 | Session expiry during request | Token expires mid-call | Request completes or clean expiry error | High |

### 21.3 Cache Race Conditions

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 21.3.1 | Cache stampede | 100 requests when cache empty | Only one fetches, others wait | High |
| 21.3.2 | Cache update during read | Update config while being read | Either old or new, not corrupted | High |
| 21.3.3 | Parallel cache invalidation | Multiple invalidations simultaneously | Cache eventually consistent | Medium |

---

## 22. Gateway Restart & Recovery

### 22.1 Graceful Shutdown

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 22.1.1 | Shutdown with active requests | Send SIGTERM during tool call | Requests complete, then shutdown | Critical |
| 22.1.2 | Shutdown with SSE connections | SIGTERM with active SSE | Clients notified, connections closed | High |
| 22.1.3 | Shutdown timeout | Requests taking too long | Force shutdown after timeout | High |
| 22.1.4 | Shutdown cleans up resources | Shutdown gateway | No orphan connections, memory freed | Medium |

### 22.2 Session Recovery After Restart

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 22.2.1 | Session survives restart | Restart gateway, use old session ID | Session restored from Redis | High |
| 22.2.2 | In-flight request during restart | Request mid-flight when gateway dies | Client gets error, can retry | High |
| 22.2.3 | Upstream connection recovery | Restart gateway, reconnect upstream | Upstream connection re-established | High |
| 22.2.4 | OAuth state survives restart | Mid-OAuth flow, gateway restarts | Flow can complete or clear restart | Medium |

### 22.3 Rolling Deployment

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 22.3.1 | Zero-downtime deployment | Replace gateway instance | No failed requests during switch | High |
| 22.3.2 | Session affinity during deploy | Sticky sessions during rollout | Sessions stay on same instance | Medium |
| 22.3.3 | Load balancer health checks | Check /health during deploy | Proper ready/not-ready signaling | High |

---

## 23. Observability & Debugging

### 23.1 Request Tracing

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 23.1.1 | Trace ID propagation | Send X-Trace-ID header | Same ID in logs and upstream | Medium |
| 23.1.2 | Generate trace ID if missing | Request without trace ID | Gateway generates one | Medium |
| 23.1.3 | Trace ID in error responses | Request that errors | Trace ID in error for debugging | Medium |

### 23.2 Debug Logging

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 23.2.1 | Debug mode logging | Enable DEBUG=true | Verbose logs including request/response | Low |
| 23.2.2 | Sensitive data redaction | Check logs for tokens/keys | No secrets in logs | Critical |
| 23.2.3 | Log levels respected | Set LOG_LEVEL=warn | Only warn+ messages logged | Low |

### 23.3 Metrics & Health

| # | Test Case | Steps | Expected Result | Priority |
|---|-----------|-------|-----------------|----------|
| 23.3.1 | Prometheus metrics endpoint | GET /metrics | Returns Prometheus format | Medium |
| 23.3.2 | Request latency histogram | Make requests, check metrics | Latency buckets populated | Low |
| 23.3.3 | Error rate metric | Cause errors, check metrics | Error counter incremented | Low |
| 23.3.4 | Active sessions gauge | Create sessions, check metrics | Session count accurate | Low |

---

## Quick Reference: Common Commands

```bash
# Health check
curl http://localhost:3000/health

# OAuth discovery
curl http://localhost:3000/.well-known/oauth-authorization-server

# Protected resource metadata
curl http://localhost:3000/.well-known/oauth-protected-resource/myworkspace/myserver/mcp

# MCP request with API key
curl -X POST http://localhost:3000/myworkspace/myserver/mcp \
  -H "Content-Type: application/json" \
  -H "x-portkey-api-key: YOUR_API_KEY" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","clientInfo":{"name":"test","version":"1.0.0"},"capabilities":{}},"id":1}'

# List tools
curl -X POST http://localhost:3000/myworkspace/myserver/mcp \
  -H "Content-Type: application/json" \
  -H "x-portkey-api-key: YOUR_API_KEY" \
  -H "mcp-session-id: SESSION_ID" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":2}'

# Call tool
curl -X POST http://localhost:3000/myworkspace/myserver/mcp \
  -H "Content-Type: application/json" \
  -H "x-portkey-api-key: YOUR_API_KEY" \
  -H "mcp-session-id: SESSION_ID" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"echo","arguments":{"message":"hello"}},"id":3}'
```

---

## Notes for Testers

1. **Priority Legend:**
   - **Critical**: Must pass for release
   - **High**: Should pass for release
   - **Medium**: Nice to have, can defer
   - **Low**: Edge cases, test when time permits

2. **Test Data Preparation:**
   - Create test workspace and server configurations
   - Generate valid and invalid API keys
   - Set up upstream MCP server (mock or real)
   - Configure Control Plane access if testing that path

3. **Environment Variables:**
   - `ALBUS_BASEPATH`: Control Plane URL
   - `MCP_GATEWAY_BASE_URL`: Gateway public URL
   - `MCP_PORT`: Gateway port (default 3000)
   - `REDIS_URL`: Redis connection string
   - `JWT_PRIVATE_KEY`: For JWT signing
   - `SERVERS_CONFIG_PATH`: Local config path

4. **Timeout Considerations:**
   - Session init: 30 seconds
   - Tool calls: Varies by upstream
   - Token introspection: 5 seconds typical

5. **When reporting bugs, include:**
   - Full request/response
   - Headers sent
   - Session ID (if applicable)
   - Timestamps
   - Server logs if available

---

## Special Testing Scenarios

### Testing Resilience (Sections 17-18)

**Tools needed:**
- `toxiproxy` or `tc` (traffic control) for network simulation
- A slow/configurable upstream server
- Redis CLI for stopping/starting Redis

**Simulating failures:**
```bash
# Stop Redis mid-test
redis-cli SHUTDOWN NOSAVE

# Simulate slow network (Linux)
tc qdisc add dev eth0 root netem delay 500ms

# Kill upstream server
kill -9 $(pgrep -f "upstream-server")
```

### Testing Rate Limits (Section 20)

**Load testing tools:**
- `wrk` or `ab` (Apache Bench) for HTTP load
- `k6` for more complex scenarios

```bash
# 100 requests/second for 10 seconds
wrk -t4 -c100 -d10s -R100 http://localhost:3000/health

# Parallel tool calls
for i in {1..50}; do
  curl -X POST http://localhost:3000/ws/srv/mcp \
    -H "x-portkey-api-key: KEY" \
    -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"echo","arguments":{}},"id":'$i'}' &
done
wait
```

### Testing Concurrency (Section 21)

**Parallel request script:**
```bash
#!/bin/bash
# concurrent_test.sh - Fire N parallel requests
N=${1:-10}
URL="http://localhost:3000/ws/srv/mcp"

for i in $(seq 1 $N); do
  (
    curl -s -X POST "$URL" \
      -H "Content-Type: application/json" \
      -H "x-portkey-api-key: YOUR_KEY" \
      -d '{"jsonrpc":"2.0","method":"tools/list","id":'$i'}' \
      -o /dev/null -w "Request $i: %{http_code} in %{time_total}s\n"
  ) &
done
wait
echo "All $N requests completed"
```

### Testing Graceful Shutdown (Section 22)

```bash
# Start gateway, note PID
npm run start:mcp &
GATEWAY_PID=$!

# Send requests, then SIGTERM
sleep 2
curl -X POST http://localhost:3000/ws/srv/mcp ... &
sleep 0.5
kill -SIGTERM $GATEWAY_PID

# Check if request completed
wait
```

### Testing Client Disconnects (Section 17.3)

```bash
# Start request, kill it mid-flight
timeout 0.5 curl -X POST http://localhost:3000/ws/srv/mcp \
  -H "x-portkey-api-key: KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"slow_tool"},"id":1}'

# Check gateway logs for proper cleanup
```

---

## Test Coverage Summary

| Section | Tests | Priority Breakdown |
|---------|-------|-------------------|
| 1-4. Core Functionality | 66 | 40 Critical/High |
| 5-7. Policies & Headers | 28 | 20 Critical/High |
| 8-10. Transport & Errors | 29 | 22 Critical/High |
| 11-16. Multi-tenant & Edge | 33 | 18 Critical/High |
| 17-18. Streaming & Resilience | 31 | 24 Critical/High |
| 19. OAuth Edge Cases | 22 | 18 Critical/High |
| 20. Rate Limiting | 14 | 10 Critical/High |
| 21. Concurrency | 11 | 8 Critical/High |
| 22. Restart & Recovery | 10 | 8 Critical/High |
| 23. Observability | 10 | 2 Critical/High |
| **Total** | **254** | **170 Critical/High** |

---

## Automated vs Manual Testing

Some tests are better suited for automation, others for manual testing:

### Best for Automation (E2E Tests)
- Health checks (Section 1)
- Authentication flows (Section 2)
- MCP protocol operations (Section 4)
- Tool policies (Section 5)
- Error handling (Section 10)

### Best for Manual Testing
- OAuth browser flows (Section 3.4)
- Visual consent pages
- Complex multi-step scenarios
- Exploratory security testing

### Requires Special Setup
- Rate limiting (Section 20) - needs load testing tools
- Resilience (Section 18) - needs failure injection
- Concurrency (Section 21) - needs parallel test harness
- Restart/Recovery (Section 22) - needs process control

