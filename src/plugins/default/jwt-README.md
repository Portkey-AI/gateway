# JWT Authentication Plugin

The JWT plugin provides comprehensive JWT (JSON Web Token) validation and authentication for the Portkey Gateway. It supports signature verification, claim validation, and custom business logic rules.

## Features

- ✅ **Signature Verification**: Validates JWT signatures using JWKS (JSON Web Key Set)
- ✅ **Inline JWKS Support**: Provide JWKS directly without requiring external URI
- ✅ **Token Introspection**: Validates tokens via external introspection endpoint (RFC 7662)
- ✅ **Required Claims**: Ensures specific claims are present in the token
- ✅ **Claim Value Validation**: Validates claim values with flexible matching strategies
- ✅ **Header-Payload Matching**: Ensures consistency between header and payload values
- ✅ **JWKS Caching**: Efficient JWKS caching to reduce external calls (URI-based)
- ✅ **Introspection Caching**: Cache introspection results with automatic expiry validation
- ✅ **Multi-tenant Support**: Validate tenant IDs and other organizational claims
- ✅ **Role-Based Access**: Validate user groups, roles, and permissions
- ✅ **OAuth2/OIDC Support**: Standard audience, issuer, and scope validation
- ✅ **Claim Extraction**: Extract JWT claims and inject them into request context as headers

## Configuration Parameters

### Core Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `jwks` | object | Conditional* | - | Inline JWKS object for token verification |
| `jwksUri` | string | Conditional* | - | URI to fetch JSON Web Key Set for token verification |
| `introspectEndpoint` | string | Conditional* | - | Token introspection endpoint URL (RFC 7662) |
| `headerKey` | string | No | `"Authorization"` | Header containing the JWT token |

*Either `jwks`, `jwksUri`, or `introspectEndpoint` must be provided.

#### JWKS Validation Parameters (when using `jwks` or `jwksUri`)

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `algorithms` | string[] | No | `["RS256"]` | Allowed signing algorithms |
| `cacheMaxAge` | number | No | `86400` | JWKS cache duration in seconds (24h) - only applies to `jwksUri` |
| `clockTolerance` | number | No | `5` | Clock tolerance in seconds for time-based claims (`exp`, `nbf`) |
| `maxTokenAge` | string | No | `"1d"` | Maximum token age (e.g., '1d', '12h', '30m') |

#### Token Introspection Parameters (when using `introspectEndpoint`)

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `introspectContentType` | string | No | - | Content type for Introspection Endpoint|
| `introspectCacheMaxAge` | number | No | - | Cache introspection results for this many seconds |
| `clockTolerance` | number | No | `5` | Clock tolerance in seconds for time-based claims (`exp`, `nbf`) |

**Note**: `clockTolerance` applies to both JWKS and token introspection validation methods for consistent time-based claim handling.

### Validation Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `requiredClaims` | string[] | No | Array of claim names that must be present |
| `claimValues` | object | No | Object mapping claim names to expected values with match types |
| `headerPayloadMatch` | string[] | No | Array of keys where header[key] must equal payload[key] |
| `extractClaims` | string[] | No | Array of claim names to extract and inject into request context |
| `claimPrefix` | string | No | Prefix for extracted claim headers (default: `"x-jwt-"`) |

## Claim Value Handling

### Value Type Normalization

The plugin automatically normalizes claim values for comparison:

- **Arrays**: Preserved as arrays (e.g., `["admin", "developer"]`)
- **Strings (scope claim)**: Split by spaces per RFC 6749 (e.g., `"read:api write:api"` → `["read:api", "write:api"]`)
- **Strings (other claims)**: Treated as single values, spaces preserved (e.g., `"John Doe"` → `["John Doe"]`)
- **Other types**: Converted to string (e.g., `123` → `["123"]`)

**Important Notes:**
- Only the `scope` claim is split by spaces. All other string claims preserve spaces to support values like names, addresses, and descriptions.
- The `exact` matchType only works for single-value (string) claims. For array claims, use `contains` or `containsAll`.

## Match Types

The `claimValues` parameter supports different match types for flexible validation:

### 1. `exact` (default)
The claim value must exactly equal the expected value. **Requires single-value string claim and single expected value.**

**Behavior:**
- Single payload value must equal single expected value
- Strict equality check (`===`)
- No OR logic - exactly one-to-one matching
- Arrays not supported - use `contains` or `containsAll` instead

**Use cases**: `iss`, `sub`, `client_id` - single exact value validation

**Examples:**
- Payload: `"tenant-123"`, Expected: `"tenant-123"` → ✓ Match
- Payload: `"tenant-123"`, Expected: `["tenant-123"]` → ✓ Match (array with single value)
- Payload: `"tenant-123"`, Expected: `["tenant-123", "tenant-456"]` → ✗ No match (use `contains` for OR logic)
- Payload: `"admin"`, Expected: `"moderator"` → ✗ No match
- Payload: `["admin", "user"]`, Expected: `"admin"` → ✗ No match (use `contains` for arrays)

**Note**: For multiple valid values (OR logic) or array claims, use `contains` or `containsAll` matchType instead.

```json
{
  "claimValues": {
    "iss": {
      "values": "https://auth.example.com"
    }
  }
}
```

### 2. `contains`
Array/string must contain at least one of the expected values (OR logic). **Use this for array claims.**

**Behavior:**
- For arrays: Checks if any element in the payload array **contains** the expected value as a substring
- For strings: Checks if the string contains the expected value as a substring

**Use cases**: `aud` (JWT audience arrays), `groups`, `roles`, `permissions`, array validation

**Examples:**
- Payload: `["admin", "user"]`, Expected: `["admin"]` → ✓ Match (array contains "admin")
- Payload: `["super-admin"]`, Expected: `["admin"]` → ✓ Match ("super-admin" contains "admin" substring)
- Payload: `["api1", "api2"]`, Expected: `["api1"]` → ✓ Match (JWT aud array validation)
- Payload: `"developer"`, Expected: `["dev"]` → ✓ Match ("developer" contains "dev")

```json
{
  "claimValues": {
    "groups": {
      "values": ["admin", "moderator"],
      "matchType": "contains"
    }
  }
}
```

### 3. `containsAll`
Array/string must contain ALL of the expected values as substrings (AND logic). **Use this when ALL values are required.**

**Behavior:**
- Checks if the payload contains ALL expected values as substrings

**Use cases**: `scope` (requires ALL specified scopes), required permissions, multiple required groups

```json
{
  "claimValues": {
    "scope": {
      "values": ["read:api", "write:api"],
      "matchType": "containsAll"
    }
  }
}
```

### 4. `regex`
Value must match the regex pattern.

**Behavior:**
- Tests the claim value against a regular expression pattern

**Use cases**: Email domain validation, pattern matching, flexible string validation

```json
{
  "claimValues": {
    "email": {
      "values": ".*@(company1|company2)\\.com$",
      "matchType": "regex"
    }
  }
}
```

### Quick Reference: When to Use Each Match Type

| Claim Type | Example | Recommended matchType |
|------------|---------|----------------------|
| Single value, exact match | `iss`, `sub`, `client_id` | `exact` |
| Single value, OR logic (multiple valid values) | `tenant_id` with multiple tenants | `contains` |
| Array - check if contains any value | `aud`, `groups` (OR logic) | `contains` |
| Array - check if contains all values | `scope` (AND logic) | `containsAll` |
| Pattern matching | `email` domain validation | `regex` |

## Validation Methods

The plugin supports three validation methods:

### 1. Inline JWKS Validation (Cryptographic, Static)
Validates JWT signature using an inline JWKS object provided in the configuration. The public keys are embedded directly in the plugin configuration.

**Best for**: Testing, development, static key deployments, embedded systems

**Pros**: No external dependencies, fastest validation, no network calls
**Cons**: Requires config updates for key rotation, not suitable for dynamic key management

### 2. JWKS URI Validation (Cryptographic, Dynamic)
Validates JWT signature using JSON Web Key Set fetched from a URI. The plugin fetches public keys from the JWKS endpoint and verifies the token's cryptographic signature locally.

**Best for**: Production deployments, high-performance scenarios, self-contained JWTs, automatic key rotation

**Pros**: Automatic key rotation support, caching for performance, industry standard
**Cons**: Requires network access, JWKS endpoint dependency

### 3. Token Introspection (Remote)
Validates tokens via an external introspection endpoint following RFC 7662. The authorization server validates the token and returns its status and claims.

**Best for**: Opaque tokens, centralized validation, revocation support, real-time validation

**Pros**: Works with opaque tokens, immediate revocation support, centralized control
**Cons**: Network latency, external service dependency

## Usage Examples

### 1. Basic JWT Validation (Inline JWKS)

Validates JWT signature using inline JWKS configuration:

```json
{
  "jwks": {
    "keys": [
      {
        "kty": "RSA",
        "kid": "my-key-id",
        "use": "sig",
        "alg": "RS256",
        "n": "xGOr-H7A-PWH_4...",
        "e": "AQAB"
      }
    ]
  },
  "algorithms": ["RS256"]
}
```

**Note**: This method is ideal for development, testing, or scenarios with static keys that don't require rotation.

### 2. Basic JWT Validation (JWKS URI)

Validates only the JWT signature and standard time-based claims by fetching keys from a URI:

```json
{
  "jwksUri": "https://auth.example.com/.well-known/jwks.json",
  "algorithms": ["RS256"]
}
```

### 3. Basic Token Introspection

Validates token via introspection endpoint:

```json
{
  "introspectEndpoint": "https://auth.example.com/oauth/introspect"
}
```

### 4. Token Introspection with Caching

Cache introspection results for better performance:

```json
{
  "introspectEndpoint": "https://auth.example.com/oauth/introspect",
  "introspectCacheMaxAge": 300,
  "clockTolerance": 5
}
```

**Note**: Cache TTL automatically respects token expiration time (with clock tolerance), using the minimum of `introspectCacheMaxAge` and time until token expires.

### 5. Required Claims Validation

Ensures specific claims are present in the token:

```json
{
  "jwksUri": "https://auth.example.com/.well-known/jwks.json",
  "requiredClaims": ["sub", "email", "tenant_id"]
}
```

### 6. Issuer Validation

Validates the token issuer:

```json
{
  "jwksUri": "https://auth.example.com/.well-known/jwks.json",
  "claimValues": {
    "iss": {
      "values": "https://auth.example.com"
    }
  }
}
```

### 7. Audience Validation

Validates the token audience. Use `contains` to check if your API is in the audience array (JWT spec-compliant):

```json
{
  "jwksUri": "https://auth.example.com/.well-known/jwks.json",
  "claimValues": {
    "aud": {
      "values": ["https://api.example.com"],
      "matchType": "contains"
    }
  }
}
```

For single-audience tokens, use `exact`:

```json
{
  "jwksUri": "https://auth.example.com/.well-known/jwks.json",
  "claimValues": {
    "aud": {
      "values": ["https://api.example.com", "https://api-staging.example.com"]
    }
  }
}
```

### 8. Group/Role Validation

Validates user belongs to specific groups (OR logic - user must be in at least one group):

```json
{
  "jwksUri": "https://auth.example.com/.well-known/jwks.json",
  "claimValues": {
    "groups": {
      "values": ["admin", "moderator"],
      "matchType": "contains"
    }
  }
}
```

### 9. Scope Validation

Validates user has ALL required OAuth2 scopes (AND logic):

```json
{
  "jwksUri": "https://auth.example.com/.well-known/jwks.json",
  "claimValues": {
    "scope": {
      "values": ["read:api", "write:api"],
      "matchType": "containsAll"
    }
  }
}
```

**Note**: The `scope` claim receives special handling per RFC 6749. If the value is a string, it's automatically split by spaces (e.g., `"read:api write:api"` becomes `["read:api", "write:api"]`). All other claims treat strings as single values, preserving spaces.

### 10. Multi-Tenant Validation

Restricts access to specific tenants (OR logic - any one of these tenants):

```json
{
  "jwksUri": "https://auth.example.com/.well-known/jwks.json",
  "requiredClaims": ["tenant_id"],
  "claimValues": {
    "tenant_id": {
      "values": ["tenant-123", "tenant-456", "tenant-789"],
      "matchType": "contains"
    }
  }
}
```

### 11. Email Domain Validation

Validates email belongs to specific domains using regex:

```json
{
  "jwksUri": "https://auth.example.com/.well-known/jwks.json",
  "claimValues": {
    "email": {
      "values": ".*@(company1|company2)\\.com$",
      "matchType": "regex"
    }
  }
}
```

### 12. Header-Payload Match Validation

Ensures header and payload values match for specific keys:

```json
{
  "jwksUri": "https://auth.example.com/.well-known/jwks.json",
  "headerPayloadMatch": ["kid", "alg"]
}
```

### 13. Claim Extraction to Context

Extracts validated JWT claims and injects them as headers for downstream services:

```json
{
  "jwksUri": "https://auth.example.com/.well-known/jwks.json",
  "extractClaims": ["sub", "email", "tenant_id", "groups"],
  "claimPrefix": "x-jwt-"
}
```

**Result**: Claims are extracted and added as headers:
- `x-jwt-sub`: user-123
- `x-jwt-email`: user@example.com
- `x-jwt-tenant-id`: tenant-456
- `x-jwt-groups`: admin,developer

This allows downstream services to use the authenticated user information without parsing the JWT themselves.

### 14. Token Introspection with Claim Validation

Combine introspection with additional claim validation:

```json
{
  "introspectEndpoint": "https://auth.example.com/oauth/introspect",
  "introspectCacheMaxAge": 300,
  "clockTolerance": 5,
  "requiredClaims": ["sub", "email", "tenant_id"],
  "claimValues": {
    "tenant_id": {
      "values": ["tenant-123", "tenant-456"],
      "matchType": "contains"
    },
    "groups": {
      "values": ["admin", "developer"],
      "matchType": "contains"
    }
  },
  "extractClaims": ["sub", "email", "tenant_id", "groups"],
  "claimPrefix": "x-jwt-"
}
```

### 15. Comprehensive Production Setup (JWKS URI)

A complete configuration covering all validation scenarios using JWKS URI:

```json
{
  "jwksUri": "https://auth.example.com/.well-known/jwks.json",
  "algorithms": ["RS256", "ES256"],
  "cacheMaxAge": 86400,
  "clockTolerance": 5,
  "maxTokenAge": "1d",
  "requiredClaims": ["sub", "email", "tenant_id"],
  "claimValues": {
    "iss": {
      "values": "https://auth.example.com"
    },
    "aud": {
      "values": "https://api.example.com",
      "matchType": "contains"
    },
    "tenant_id": {
      "values": ["tenant-123", "tenant-456"],
      "matchType": "contains"
    },
    "groups": {
      "values": ["admin", "developer"],
      "matchType": "contains"
    },
    "scope": {
      "values": ["read:api", "write:api"],
      "matchType": "containsAll"
    },
    "email": {
      "values": ".*@(company1|company2)\\.com$",
      "matchType": "regex"
    }
  },
  "headerPayloadMatch": ["kid"],
  "extractClaims": ["sub", "email", "tenant_id", "groups", "scope"],
  "claimPrefix": "x-jwt-"
}
```

### 16. Comprehensive Production Setup (Inline JWKS)

A complete configuration using inline JWKS (suitable for testing or static deployments):

```json
{
  "jwks": {
    "keys": [
      {
        "kty": "RSA",
        "kid": "production-key-2024",
        "use": "sig",
        "alg": "RS256",
        "n": "xGOr-H7A-PWH_4...",
        "e": "AQAB"
      }
    ]
  },
  "algorithms": ["RS256", "ES256"],
  "clockTolerance": 5,
  "maxTokenAge": "1d",
  "requiredClaims": ["sub", "email", "tenant_id"],
  "claimValues": {
    "iss": {
      "values": "https://auth.example.com"
    },
    "aud": {
      "values": "https://api.example.com",
      "matchType": "contains"
    },
    "tenant_id": {
      "values": ["tenant-123", "tenant-456"],
      "matchType": "contains"
    },
    "groups": {
      "values": ["admin", "developer"],
      "matchType": "contains"
    },
    "scope": {
      "values": ["read:api", "write:api"],
      "matchType": "containsAll"
    }
  },
  "extractClaims": ["sub", "email", "tenant_id", "groups", "scope"],
  "claimPrefix": "x-jwt-"
}
```

**Note**: When using inline JWKS, remember to update the configuration when rotating keys. For dynamic key rotation, use `jwksUri` instead.

## Response Format

### Success Response

When all validations pass:

```json
{
  "error": null,
  "verdict": true,
  "data": {
    "verdict": true,
    "explanation": "JWT token validation succeeded",
    "validations": {
      "signatureValid": true,
      "requiredClaims": { "valid": true },
      "claimValues": { "valid": true },
      "headerPayloadMatch": { "valid": true }
    },
  },
  "transformedData": {
    "headers": {
      "x-jwt-sub": "user-123",
      "x-jwt-email": "user@example.com",
      "x-jwt-tenant-id": "tenant-456"
    }
  },
  "transformed": true
}
```

### Failure Response

When validation fails:

```json
{
  "error": null,
  "verdict": false,
  "data": {
    "verdict": false,
    "explanation": "JWT validation failed: Missing required claims: email, tenant_id; Invalid claim values: groups",
    "validations": {
      "signatureValid": true,
      "requiredClaims": {
        "valid": false,
        "missing": ["email", "tenant_id"]
      },
      "claimValues": {
        "valid": false,
        "failed": ["groups"]
      }
    }
  }
}
```

## Token Format

The plugin expects JWT tokens in the following format:

```
Authorization: Bearer <JWT_TOKEN>
```

Or with a custom header:

```
X-API-Token: Bearer <JWT_TOKEN>
```

The `Bearer` prefix is optional and will be automatically stripped if present.

## Best Practices

### 1. Choosing Validation Method

- **Use Inline JWKS** for:
  - Development and testing environments
  - Static key deployments where keys rarely change
  - Offline or air-gapped environments
  - Scenarios where external network calls are prohibited
  
- **Use JWKS URI** for:
  - Production deployments with key rotation
  - Multi-tenant systems with dynamic key management
  - Integration with standard OAuth/OIDC providers
  - Scenarios requiring automatic key updates

- **Use Token Introspection** for:
  - Opaque (reference) tokens
  - Real-time token revocation requirements
  - Centralized token validation and auditing
  - Legacy systems without JWKS support

### 2. Security

- Always validate the issuer (`iss`) to prevent token substitution attacks
- Validate the audience (`aud`) to ensure tokens are intended for your API
- Use appropriate `clockTolerance` (5-10 seconds) to handle clock skew
- Set reasonable `maxTokenAge` to limit token lifetime
- Enable `headerPayloadMatch` for `kid` to prevent key confusion attacks
- When using inline JWKS, ensure keys are stored securely in configuration
- Rotate keys regularly and update configurations accordingly

### 3. Performance

- Set appropriate `cacheMaxAge` (default 24h) to reduce JWKS fetches (only applies to JWKS URI)
- Consider your JWKS update frequency when setting cache duration
- Inline JWKS provides the fastest validation (no external calls)
- Use introspection caching when using token introspection endpoint

### 4. Multi-Tenancy

- Always include `tenant_id` in `requiredClaims`
- Validate `tenant_id` values explicitly
- Consider adding tenant-specific JWKS URIs for larger deployments

### 5. Role-Based Access Control (RBAC)

- Use `contains` match type for groups/roles (OR logic)
- Use `containsAll` match type for scopes/permissions (AND logic)
- Keep role/permission lists updated and synchronized with your auth provider

### 6. Claim Extraction

- Only extract claims needed by downstream services
- Use consistent `claimPrefix` across your infrastructure
- Be mindful of header size limits when extracting large claims
- Consider extracting computed values (e.g., user roles) rather than raw arrays
- Extracted claims are only added if validation succeeds

### 7. Testing

- Test with expired tokens
- Test with invalid signatures
- Test with missing claims
- Test with invalid claim values
- Test with tokens from different issuers
- Test clock skew scenarios
- Test claim extraction with missing claims
- Test inline JWKS with multiple keys
- Test key rotation scenarios (JWKS URI)

## Common Patterns

### Pattern 1: API Gateway Authentication

```json
{
  "jwksUri": "https://auth.example.com/.well-known/jwks.json",
  "requiredClaims": ["sub"],
  "claimValues": {
    "iss": { "values": "https://auth.example.com" },
    "aud": { "values": "https://api.example.com", "matchType": "contains" }
  }
}
```

### Pattern 2: Admin-Only Access

```json
{
  "jwksUri": "https://auth.example.com/.well-known/jwks.json",
  "claimValues": {
    "groups": {
      "values": ["admin"],
      "matchType": "contains"
    }
  }
}
```

### Pattern 3: Tenant Isolation

```json
{
  "jwksUri": "https://auth.example.com/.well-known/jwks.json",
  "requiredClaims": ["tenant_id"],
  "claimValues": {
    "tenant_id": {
      "values": ["<SPECIFIC_TENANT_ID>"]
    }
  }
}
```

### Pattern 4: Service-to-Service Authentication

```json
{
  "jwksUri": "https://auth.example.com/.well-known/jwks.json",
  "requiredClaims": ["client_id"],
  "claimValues": {
    "scope": {
      "values": ["service:read", "service:write"],
      "matchType": "containsAll"
    }
  }
}
```

## Troubleshooting

### Token Not Found

```
Missing authorization header
```

**Solution**: Ensure the token is sent in the correct header (`Authorization` by default)

### Invalid Signature

```
JWT signature validation error: ...
```

**Solution**: Verify your JWKS URI is correct and the token was signed by the expected issuer

### Missing Claims

```
JWT validation failed: Missing required claims: email, tenant_id
```

**Solution**: Ensure your auth provider includes these claims in the token

### Invalid Claim Values

```
JWT validation failed: Invalid claim values: groups
```

**Solution**: Check that the claim values in your token match the expected values in your configuration

### Clock Skew Issues

```
JWT signature validation error: token is expired
```

**Solution**: Increase `clockTolerance` to handle clock differences between systems

### Claim Extraction Not Working

If claims are not being extracted:
1. Ensure validation passes (claims are only extracted on success)
2. Verify claim names exist in the JWT payload
3. Check that `extractClaims` is an array of strings
4. Verify downstream services can see the injected headers

## Advanced Topics

### Understanding Claim Extraction

Claim extraction allows the gateway to parse validated JWT claims and inject them into the request context as headers. This provides several benefits:

#### Benefits

1. **Simplified Downstream Services**: Backend services receive user context without parsing JWTs
2. **Consistent Context**: All services see the same normalized claim format
3. **Reduced Coupling**: Services don't need JWT libraries or JWKS endpoints
4. **Performance**: Claims are extracted once at the gateway, not by each service

#### How It Works

1. **After successful JWT validation**, the plugin extracts specified claims from the payload
2. **Claims are formatted** as headers with a configurable prefix:
   ```
   x-jwt-sub: user-123
   x-jwt-email: user@example.com
   x-jwt-tenant-id: tenant-456
   x-jwt-groups: admin,developer
   ```

3. **Downstream services** can read these headers directly:
   ```javascript
   const userId = req.headers['x-jwt-sub'];
   const userEmail = req.headers['x-jwt-email'];
   ```

#### Array and Object Handling

- **Arrays**: Joined with commas (e.g., `["admin", "developer"]` → `"admin,developer"`)
- **Objects**: Serialized as JSON strings
- **Primitives**: Converted to strings

#### Security Considerations

- Claims are only extracted if JWT validation succeeds
- Malicious headers in the original request are overwritten by validated claims
- Use HTTPS to protect extracted claim headers in transit
- Consider header size limits when extracting large claims

## Further Reading

- [JWT.io](https://jwt.io/) - JWT documentation and debugger
- [RFC 7519](https://tools.ietf.org/html/rfc7519) - JSON Web Token (JWT) specification
- [RFC 7517](https://tools.ietf.org/html/rfc7517) - JSON Web Key (JWK) specification
- [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html) - OIDC specification

