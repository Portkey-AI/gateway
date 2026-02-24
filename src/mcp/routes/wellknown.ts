// routes/wellknown.ts
import { Hono } from 'hono';
import { createLogger } from '../../shared/utils/logger';
import { getBaseUrl } from '../utils/mcp-utils';
import { Environment } from '../../utils/env';
import { getPublicKeyJWK } from '../utils/userIdentity';

const logger = createLogger('wellknown-routes');

type Env = {
  Variables: {
    controlPlane?: any;
  };
};

const MCP_GATEWAY_BASE_URL = Environment({}).MCP_GATEWAY_BASE_URL;
const CACHE_MAX_AGE = 1;
const JWKS_CACHE_MAX_AGE = 3600; // Cache JWKS for 1 hour

const wellKnownRoutes = new Hono<Env>();

/**
 * JWKS Endpoint for JWT verification
 * Returns the public key(s) used to sign user identity JWTs
 * MCP servers can use this to verify X-User-JWT headers
 */
wellKnownRoutes.get('/jwks.json', async (c) => {
  logger.debug('GET /.well-known/jwks.json');

  const publicKey = await getPublicKeyJWK();

  if (!publicKey) {
    logger.warn('JWKS requested but no signing key is configured');
    return c.json(
      {
        error: 'not_configured',
        error_description:
          'JWT signing is not configured. Set JWT_PRIVATE_KEY environment variable.',
      },
      503
    );
  }

  const jwks = {
    keys: [publicKey],
  };

  return c.json(jwks, 200, {
    'Cache-Control': `public, max-age=${JWKS_CACHE_MAX_AGE}`,
    'Content-Type': 'application/json',
  });
});

/**
 * OAuth 2.1 Discovery Endpoint
 * Returns the OAuth authorization server metadata for this gateway
 */
wellKnownRoutes.get('/oauth-authorization-server', async (c) => {
  logger.debug('GET /.well-known/oauth-authorization-server');

  const baseUrl = MCP_GATEWAY_BASE_URL || getBaseUrl(c).origin;

  // OAuth 2.1 Authorization Server Metadata (RFC 8414)
  // https://datatracker.ietf.org/doc/html/rfc8414
  const metadata = {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    token_endpoint_auth_signing_alg_values_supported: ['RS256'],
    introspection_endpoint: `${baseUrl}/oauth/introspect`,
    introspection_endpoint_auth_methods_supported: [
      'client_secret_basic',
      'client_secret_post',
    ],
    revocation_endpoint: `${baseUrl}/oauth/revoke`,
    revocation_endpoint_auth_methods_supported: [
      'client_secret_basic',
      'client_secret_post',
    ],
    registration_endpoint: `${baseUrl}/oauth/register`,
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

  return c.json(metadata, 200, {
    'Cache-Control': `public, max-age=${CACHE_MAX_AGE}`, // Cache for 1 hour
  });
});

wellKnownRoutes.get(
  '/oauth-authorization-server/:workspaceId/:serverId/mcp',
  async (c) => {
    logger.debug(
      'GET /.well-known/oauth-authorization-server/:workspaceId/:serverId/mcp'
    );

    const baseUrl = MCP_GATEWAY_BASE_URL || getBaseUrl(c).origin;

    const metadata = {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/${c.req.param('workspaceId')}/${c.req.param('serverId')}/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      introspection_endpoint: `${baseUrl}/oauth/introspect`,
      introspection_endpoint_auth_methods_supported: ['none'],
      revocation_endpoint: `${baseUrl}/oauth/revoke`,
      revocation_endpoint_auth_methods_supported: ['none'],
      registration_endpoint: `${baseUrl}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      response_modes_supported: ['query', 'fragment'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      service_documentation: 'https://portkey.ai/docs/mcp-gateway',
      ui_locales_supported: ['en'],
    };

    return c.json(metadata, 200, {
      'Cache-Control': `public, max-age=${CACHE_MAX_AGE}`, // Cache for 1 hour
    });
  }
);

wellKnownRoutes.get('/oauth-authorization-server/:serverId/mcp', async (c) => {
  logger.debug('GET /.well-known/oauth-authorization-server/:serverId/mcp');

  const baseUrl = MCP_GATEWAY_BASE_URL || getBaseUrl(c).origin;

  const metadata = {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/${c.req.param('serverId')}/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    introspection_endpoint: `${baseUrl}/oauth/introspect`,
    introspection_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint: `${baseUrl}/oauth/revoke`,
    revocation_endpoint_auth_methods_supported: ['none'],
    registration_endpoint: `${baseUrl}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    response_modes_supported: ['query', 'fragment'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    service_documentation: 'https://portkey.ai/docs/mcp-gateway',
    ui_locales_supported: ['en'],
  };

  return c.json(metadata, 200, {
    'Cache-Control': `public, max-age=${CACHE_MAX_AGE}`, // Cache for 1 hour
  });
});

wellKnownRoutes.get(
  '/oauth-protected-resource/:workspaceId/:serverId/mcp',
  async (c) => {
    logger.debug(
      'GET /.well-known/oauth-protected-resource/:workspaceId/:serverId/mcp',
      {
        workspaceId: c.req.param('workspaceId'),
        serverId: c.req.param('serverId'),
      }
    );

    const baseUrl = MCP_GATEWAY_BASE_URL || getBaseUrl(c).origin;
    const resourceUrl = `${baseUrl}/${c.req.param('workspaceId')}/${c.req.param('serverId')}/mcp`;

    const metadata = {
      // This MCP gateway acts as a protected resource
      resource: resourceUrl,
      // Point to our authorization server (either this gateway or control plane)
      authorization_servers: [resourceUrl],
      // Scopes required to access this resource
      scopes_supported: [
        'mcp:servers:read',
        'mcp:servers:*',
        'mcp:tools:list',
        'mcp:tools:call',
        'mcp:*',
      ],
    };

    return c.json(metadata, 200, {
      'Cache-Control': `public, max-age=${CACHE_MAX_AGE}`, // Cache for 1 hour
    });
  }
);

wellKnownRoutes.get('/oauth-protected-resource/:serverId/mcp', async (c) => {
  logger.debug('GET /.well-known/oauth-protected-resource/:serverId/mcp', {
    serverId: c.req.param('serverId'),
  });

  const baseUrl = MCP_GATEWAY_BASE_URL || getBaseUrl(c).origin;
  const resourceUrl = `${baseUrl}/${c.req.param('serverId')}/mcp`;

  const metadata = {
    // This MCP gateway acts as a protected resource
    resource: resourceUrl,
    // Point to our authorization server (either this gateway or control plane)
    authorization_servers: [resourceUrl],
    // Scopes required to access this resource
    scopes_supported: [
      'mcp:servers:read',
      'mcp:servers:*',
      'mcp:tools:list',
      'mcp:tools:call',
      'mcp:*',
    ],
  };

  return c.json(metadata, 200, {
    'Cache-Control': `public, max-age=${CACHE_MAX_AGE}`, // Cache for 1 hour
  });
});

wellKnownRoutes.get(
  '/oauth-protected-resource/:workspaceId/:serverId/sse',
  async (c) => {
    logger.debug(
      'GET /.well-known/oauth-protected-resource/:workspaceId/:serverId/sse',
      {
        workspaceId: c.req.param('workspaceId'),
        serverId: c.req.param('serverId'),
      }
    );

    const baseUrl = MCP_GATEWAY_BASE_URL || getBaseUrl(c).origin;
    const resourceUrl = `${baseUrl}/${c.req.param('workspaceId')}/${c.req.param('serverId')}/sse`;

    const metadata = {
      // This MCP gateway acts as a protected resource
      resource: resourceUrl,
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

    return c.json(metadata, 200, {
      'Cache-Control': `public, max-age=${CACHE_MAX_AGE}`, // Cache for 1 hour
    });
  }
);

wellKnownRoutes.get('/oauth-protected-resource/:serverId/sse', async (c) => {
  logger.debug('GET /.well-known/oauth-protected-resource/:serverId/sse', {
    serverId: c.req.param('serverId'),
  });

  const baseUrl = MCP_GATEWAY_BASE_URL || getBaseUrl(c).origin;
  const resourceUrl = `${baseUrl}/${c.req.param('serverId')}/sse`;

  const metadata = {
    // This MCP gateway acts as a protected resource
    resource: resourceUrl,
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

  return c.json(metadata, 200, {
    'Cache-Control': `public, max-age=${CACHE_MAX_AGE}`, // Cache for 1 hour
  });
});

export { wellKnownRoutes };
