# Local OAuth Configuration Guide

When the Portkey MCP Gateway is deployed without a control plane (`ALBUS_BASEPATH` not set), it uses a local JSON-based configuration for OAuth authentication and server management.

## Configuration Files

### 1. OAuth Configuration (`data/oauth-config.json`)

This file manages OAuth clients and tokens locally:

```json
{
  "clients": {
    "client-id": {
      "client_secret": "secret",
      "name": "Client Name",
      "allowed_scopes": ["mcp:*"],
      "allowed_servers": ["linear", "deepwiki"],
      "server_permissions": {
        "linear": {
          "allowed_tools": null,  // null = all tools allowed
          "blocked_tools": ["deleteProject", "deleteIssue"],
          "rate_limit": {
            "requests": 100,
            "window": 60  // seconds
          }
        }
      }
    }
  },
  "tokens": {
    "token-string": {
      "client_id": "client-id",
      "active": true,
      "scope": "mcp:*",
      "exp": 1999999999,  // Unix timestamp
      "mcp_permissions": { /* same as server_permissions */ }
    }
  }
}
```

### 2. Server Configuration (`data/servers.json`)

Defines available MCP servers and their default settings:

```json
{
  "servers": {
    "linear": {
      "name": "Linear MCP Server",
      "url": "https://mcp.linear.app/sse",
      "description": "Linear issue tracking",
      "default_headers": {
        "Authorization": "Bearer ${LINEAR_API_KEY}"
      },
      "available_tools": ["list_issues", "create_issue", ...],
      "default_permissions": {
        "blocked_tools": ["deleteProject"],
        "rate_limit": { "requests": 100, "window": 60 }
      }
    }
  }
}
```

## OAuth Flow

### 1. Client Registration

#### For Confidential Clients (with client_secret)
```bash
curl -X POST http://localhost:8787/oauth/register \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "My MCP Client",
    "scope": "mcp:servers:* mcp:tools:call",
    "grant_types": ["client_credentials"]
  }'
```

Response:
```json
{
  "client_id": "mcp_client_abc123",
  "client_secret": "mcp_secret_xyz789",
  "client_name": "My MCP Client",
  "scope": "mcp:servers:* mcp:tools:call",
  "token_endpoint_auth_method": "client_secret_post"
}
```

#### For Public Clients (Cursor, no client_secret)
```bash
curl -X POST http://localhost:8787/oauth/register \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "Cursor",
    "redirect_uris": ["http://127.0.0.1:54321/callback"],
    "grant_types": ["authorization_code"],
    "token_endpoint_auth_method": "none",
    "scope": "mcp:*"
  }'
```

Response:
```json
{
  "client_id": "mcp_client_def456",
  "client_name": "Cursor",
  "redirect_uris": ["http://127.0.0.1:54321/callback"],
  "grant_types": ["authorization_code"],
  "token_endpoint_auth_method": "none",
  "scope": "mcp:*"
}
```

Note: Public clients don't receive a client_secret and must use PKCE for security.

### 2. Get Access Token

```bash
curl -X POST http://localhost:8787/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=mcp_client_abc123&client_secret=mcp_secret_xyz789&scope=mcp:servers:*"
```

Response:
```json
{
  "access_token": "mcp_1234567890abcdef",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "mcp:servers:*"
}
```

### 3. Use Token with MCP

```bash
curl -X POST http://localhost:8787/linear/mcp \
  -H "Authorization: Bearer mcp_1234567890abcdef" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "initialize", ...}'
```

## Environment Variables

- `OAUTH_REQUIRED`: Set to `true` to enforce OAuth authentication
- `SERVERS_CONFIG_PATH`: Path to servers.json (default: `./data/servers.json`)

## Security Considerations

1. **File Permissions**: Ensure config files are readable only by the gateway process
2. **Secrets**: Consider encrypting client secrets in production
3. **Token Expiry**: Tokens expire after 1 hour by default
4. **Rate Limiting**: Configure per-client rate limits appropriately

## Migration from Control Plane

To migrate from control plane to local config:

1. Export clients and permissions from control plane
2. Convert to local config format
3. Set `OAUTH_REQUIRED=false` initially for testing
4. Test with both authenticated and unauthenticated requests
5. Set `OAUTH_REQUIRED=true` when ready

## Cursor Integration

When Cursor connects to your MCP Gateway, it uses the authorization code flow with PKCE:

### Automatic Dynamic Client Registration

The MCP Gateway now supports automatic client registration during the authorization flow:

1. **Automatic Detection**: When an unknown client_id attempts to authorize, it's automatically registered
2. **Public Client Setup**: Clients are registered as public clients (no client_secret) for PKCE security
3. **Full Server Access**: Dynamically registered clients get access to all configured MCP servers
4. **Redirect URI Management**: The redirect_uri is automatically saved and validated

This means:
- **No pre-registration needed**: Cursor and other MCP clients register themselves on first use
- **Seamless setup**: Just point Cursor to your gateway URL and approve access
- **Persistent registration**: Once registered, the client is saved in data/oauth-config.json

### How It Works

1. **First Connection**: Cursor attempts to authorize with its client_id
2. **Dynamic Registration**: If not found, the gateway creates the client automatically
3. **Authorization**: User sees consent screen and approves access
4. **Token Exchange**: Cursor exchanges the code for an access token (no client_secret needed)
5. **MCP Access**: Uses the token to access MCP servers

### Common Issues with Cursor

1. **"Invalid client credentials" error**: This happens when:
   - The client wasn't properly registered during dynamic registration
   - The client is treated as confidential instead of public
   - Solution: The gateway now properly handles public clients without client_secret

2. **Client not in data/oauth-config.json**: 
   - Dynamic registration now saves clients to the config file
   - Check the file after registration to confirm the client exists

3. **PKCE validation failures**:
   - Cursor always uses PKCE for security
   - The gateway validates the code_verifier against the code_challenge

### Testing Cursor Connection

1. Start your gateway:
   ```bash
   npm run dev:mcp
   ```

2. In Cursor, add your MCP server:
   ```
   http://localhost:8787/linear/mcp
   ```

3. When prompted, approve the OAuth consent in your browser

4. Check `data/oauth-config.json` to see the registered Cursor client

## Troubleshooting

- Check logs for OAuth service messages
- Verify config file syntax with `jq` or similar
- Use `/oauth/introspect` to debug token issues
- Expired tokens are cleaned up every minute automatically
- For Cursor issues, check that the client has `token_endpoint_auth_method: "none"`
