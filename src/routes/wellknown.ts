import { Hono } from 'hono';
import { createLogger } from '../utils/logger';

const logger = createLogger('wellknown-routes');

type Env = {
  Bindings: {
    ALBUS_BASEPATH?: string;
  };
};

const wellKnownRoutes = new Hono<Env>();

/**
 * OAuth 2.1 Discovery Endpoint
 * Returns the OAuth authorization server metadata for this gateway
 */
wellKnownRoutes.get('/oauth-authorization-server', async (c) => {
  logger.debug('GET /.well-known/oauth-authorization-server');
  const baseUrl = new URL(c.req.url).origin;
  const controlPlaneUrl = c.env.ALBUS_BASEPATH || process.env.ALBUS_BASEPATH;

  // OAuth 2.1 Authorization Server Metadata (RFC 8414)
  // https://datatracker.ietf.org/doc/html/rfc8414
  const metadata = {
    issuer: baseUrl,
    authorization_endpoint: controlPlaneUrl
      ? `${controlPlaneUrl}/oauth/authorize`
      : `${baseUrl}/oauth/authorize`,
    token_endpoint: controlPlaneUrl
      ? `${controlPlaneUrl}/oauth/token`
      : `${baseUrl}/oauth/token`,
    token_endpoint_auth_signing_alg_values_supported: ['RS256'],
    introspection_endpoint: controlPlaneUrl
      ? `${controlPlaneUrl}/oauth/introspect`
      : `${baseUrl}/oauth/introspect`,
    introspection_endpoint_auth_methods_supported: [
      'client_secret_basic',
      'client_secret_post',
    ],
    revocation_endpoint: controlPlaneUrl
      ? `${controlPlaneUrl}/oauth/revoke`
      : `${baseUrl}/oauth/revoke`,
    revocation_endpoint_auth_methods_supported: [
      'client_secret_basic',
      'client_secret_post',
    ],
    registration_endpoint: controlPlaneUrl
      ? `${controlPlaneUrl}/oauth/register`
      : `${baseUrl}/oauth/register`,
    scopes_supported: [
      'mcp:servers:read', // List available MCP servers
      'mcp:servers:*', // Access specific MCP servers (e.g., mcp:servers:linear)
      'mcp:tools:list', // List tools on accessible servers
      'mcp:tools:call', // Execute tools on accessible servers
      'mcp:*', // Full access to all MCP operations
    ],
    response_types_supported: ['code'],
    grant_types_supported: [
      'authorization_code',
      'refresh_token',
      'client_credentials',
    ],
    response_modes_supported: ['query', 'fragment'],
    token_endpoint_auth_methods_supported: [
      'client_secret_basic',
      'client_secret_post',
      'none', // For public clients using PKCE
    ],
    code_challenge_methods_supported: ['S256'], // Required for MCP per RFC
    service_documentation: 'https://portkey.ai/docs/mcp-gateway',
    ui_locales_supported: ['en'],
  };

  logger.debug('Returning OAuth authorization server metadata');

  return c.json(metadata, 200, {
    'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
  });
});

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728)
 * Required for MCP servers to indicate their authorization server
 */
wellKnownRoutes.get('/oauth-protected-resource', async (c) => {
  logger.debug('GET /.well-known/oauth-protected-resource');
  const baseUrl = new URL(c.req.url).origin;
  const controlPlaneUrl = c.env.ALBUS_BASEPATH || process.env.ALBUS_BASEPATH;

  const metadata = {
    // This MCP gateway acts as a protected resource
    resource: baseUrl,
    // Point to our authorization server (either this gateway or control plane)
    authorization_servers: [baseUrl],
    // Scopes required to access this resource
    scopes_supported: [
      'mcp:servers:read',
      'mcp:servers:*',
      'mcp:tools:list',
      'mcp:tools:call',
      'mcp:*',
    ],
  };

  logger.debug('Returning OAuth protected resource metadata');

  return c.json(metadata, 200, {
    'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
  });
});

export { wellKnownRoutes };
