import { Context } from 'hono';
import { ServerConfig } from '../types/mcp';
import { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';
import { externalServiceFetch } from '../../utils/fetch';

// Type for external auth config
type ExternalAuthConfig = NonNullable<ServerConfig['external_auth_config']>;

export function getBaseUrl(c: Context): URL {
  const baseUrl = new URL(c.req.url);
  if (c.req.header('x-forwarded-proto') === 'https') {
    baseUrl.protocol = 'https';
  }
  return baseUrl;
}

// Helper to create custom fetch that overrides OAuth discovery
export function createOAuthMetadataFetch(
  serverConfig: ServerConfig
): FetchLike | undefined {
  const metadata = serverConfig.oauth_server_metadata;

  // Return undefined if no metadata provided
  if (!metadata) {
    return undefined;
  }

  // Minimum required for OAuth flow to work:
  if (
    !metadata.authorization_endpoint ||
    !metadata.token_endpoint ||
    !metadata.response_types_supported?.length
  ) {
    return undefined;
  }

  return async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();

    // Intercept OAuth discovery endpoints
    if (
      url.includes('/.well-known/oauth-authorization-server') ||
      url.includes('/.well-known/openid-configuration')
    ) {
      // logger.debug('Returning pre-configured OAuth server metadata', { url });

      return new Response(JSON.stringify(metadata), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // All other requests use real fetch
    return externalServiceFetch(url, init);
  };
}

// Helper to create custom fetch that uses external auth configuration
// This is used when control plane indicates external auth is needed
export function createExternalAuthMetadataFetch(
  externalAuthConfig: ExternalAuthConfig
): FetchLike {
  // Build OAuth metadata from external auth config
  const metadata = {
    issuer:
      externalAuthConfig.issuer || externalAuthConfig.authorization_endpoint,
    authorization_endpoint: externalAuthConfig.authorization_endpoint,
    token_endpoint: externalAuthConfig.token_endpoint,
    registration_endpoint: externalAuthConfig.registration_endpoint,
    revocation_endpoint: externalAuthConfig.revocation_endpoint,
    response_types_supported: externalAuthConfig.response_types_supported || [
      'code',
    ],
    code_challenge_methods_supported:
      externalAuthConfig.code_challenge_methods_supported || ['S256'],
    token_endpoint_auth_methods_supported:
      externalAuthConfig.token_endpoint_auth_methods_supported,
    grant_types_supported: externalAuthConfig.grant_types_supported || [
      'authorization_code',
      'refresh_token',
    ],
    scopes_supported: externalAuthConfig.scopes_supported,
  };

  return async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();

    // Intercept OAuth discovery endpoints
    if (
      url.includes('/.well-known/oauth-authorization-server') ||
      url.includes('/.well-known/openid-configuration')
    ) {
      return new Response(JSON.stringify(metadata), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // All other requests use real fetch
    return externalServiceFetch(url, init);
  };
}
