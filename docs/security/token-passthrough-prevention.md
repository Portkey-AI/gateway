# Token Passthrough Prevention

## Overview

The MCP Gateway implements proper security boundaries that prevent Token Passthrough attacks as defined in the [MCP Security Best Practices](https://spec.modelcontextprotocol.io/specification/draft/security/best-practices/#token-passthrough).

## Architecture

### Separate Authentication Boundaries

The gateway maintains distinct authentication mechanisms for different connection types:

1. **Client → Gateway Authentication**: OAuth 2.1 tokens validated via token introspection
2. **Gateway → Upstream Server Authentication**: Static credentials configured per server

### No Token Forwarding

**Client tokens are never passed to upstream MCP servers.** The gateway acts as a proper authentication proxy:

```typescript
// Client authentication (OAuth token)
const introspection = await introspectToken(clientToken, controlPlaneUrl);

// Upstream authentication (static headers from config)
const upstreamTransport = new StreamableHTTPClientTransport(upstreamUrl, {
  requestInit: {
    headers: this.config.headers, // Static server credentials only
  },
});
```

### Configuration-Based Upstream Authentication

Upstream server authentication is configured statically in `servers.json`:

```json
{
  "servers": {
    "example-server": {
      "url": "https://mcp.example.com",
      "default_headers": {
        "Authorization": "Bearer static-server-token"
      }
    }
  }
}
```

## Security Benefits

This architecture prevents the Token Passthrough risks outlined in the MCP specification:

- **Security Control Circumvention**: Upstream servers receive consistent authentication regardless of client
- **Accountability**: Gateway maintains full audit trail of client actions
- **Trust Boundary Integrity**: Each service validates tokens issued specifically for it
- **Future Compatibility**: Architecture supports adding security controls without breaking existing flows

## Verification

The gateway's token isolation can be verified by:

1. Examining `src/services/mcpSession.ts` - upstream connections use only `config.headers`
2. Checking `src/middlewares/oauth/index.ts` - client tokens are validated but not forwarded
3. Reviewing `src/middlewares/mcp/hydrateContext.ts` - server configs use static headers only

## Status

✅ **COMPLIANT** - The MCP Gateway properly prevents Token Passthrough attacks through architectural design.
