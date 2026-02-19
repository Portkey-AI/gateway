/**
 * @file src/services/oauthGateway.ts
 * Unified OAuth gateway service that handles both control plane and local OAuth operations
 */
import crypto from 'crypto';
import { env } from 'hono/adapter';
import { Context } from 'hono';
import * as oidc from 'openid-client';

import { createLogger } from '../../shared/utils/logger';
import {
  McpCacheService,
  getMcpServersCache,
  getOauthStore,
} from './mcpCacheService';
import { getServerConfig } from '../middleware/hydrateContext';
import { GatewayOAuthProvider } from './upstreamOAuth';
import { ControlPlane } from '../middleware/controlPlane';
import { auth, AuthResult } from '@modelcontextprotocol/sdk/client/auth.js';
import { revokeOAuthToken } from '../utils/oauthTokenRevocation';
import {
  createOAuthMetadataFetch,
  createExternalAuthMetadataFetch,
  getBaseUrl,
} from '../utils/mcp-utils';
import { Environment } from '../../utils/env';
import { ServerConfig } from '../types/mcp';
import { trackMcpServerTokenKey } from '../utils/mcpCacheKeyTracker';

const logger = createLogger('OAuthGateway');

const ACCESS_TOKEN_TTL_SECONDS = 3600; // 1 hour
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 3600; // 30 days

const nowSec = () => Math.floor(Date.now() / 1000);

/**
 * Check if this is a managed SaaS deployment
 * External auth is only allowed for enterprise deployments
 */
const isManagedDeployment = (): boolean => {
  return Environment({}).MANAGED_DEPLOYMENT === 'ON';
};

async function verifyCodeChallenge(
  codeVerifier: string,
  codeChallenge: string,
  method: string = 'S256'
): Promise<boolean> {
  if (!codeVerifier || !codeChallenge) return false;
  if (method === 'plain') {
    return codeVerifier === codeChallenge;
  }
  return (
    (await oidc.calculatePKCECodeChallenge(codeVerifier)) === codeChallenge
  );
}

export type GrantType =
  | 'authorization_code'
  | 'refresh_token'
  | 'client_credentials';

export interface TokenRequest {
  grant_type: GrantType;
  client_id?: string;
  client_secret?: string;
  code?: string;
  redirect_uri?: string;
  code_verifier?: string;
  scope?: string;
}

export type OAuthError = {
  error:
    | 'invalid_request'
    | 'invalid_grant'
    | 'invalid_client'
    | 'server_error';
  error_description: string;
};

export interface TokenResponseSuccess {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  scope?: string;
  refresh_token?: string;
}

export type TokenResponse = TokenResponseSuccess | OAuthError;

export interface TokenIntrospectionResponse {
  active: boolean;
  scope?: string;
  client_id?: string;
  username?: string;
  exp?: number;
  iat?: number;
  workspace_id?: string;
  organisation_id?: string;
  // Server ID if the token is scoped to a specific MCP server
  server_id?: string;
  // Audience claim for resource binding validation (per RFC 9068)
  aud?: string | string[];
  // Extended fields for richer logging
  organisation_name?: string;
  workspace_name?: string;
  workspace_slug?: string;
  // Full organisation details (from control plane introspection or API key flow)
  _organisationDetails?: Record<string, any>;
  email?: string;
}

export interface OAuthClient {
  client_name: string;
  scope?: string;
  redirect_uris?: string[];
  grant_types?: GrantType[];
  token_endpoint_auth_method?: 'none' | 'client_secret_post';
  client_secret?: string;
  client_uri?: string;
  logo_uri?: string;
  client_id?: string;
}

// Cache shapes
interface StoredAccessToken {
  client_id: string;
  active: true;
  scope?: string;
  iat: number;
  exp: number;
  user_id?: string;
  username?: string;
  sub?: string;
  workspace_id?: string;
  organisation_id?: string;
  // Server ID if the token is scoped to a specific MCP server (e.g., external auth tokens)
  server_id?: string;
  // Flag indicating if this is an external auth token
  is_external_auth?: boolean;
}

interface StoredRefreshToken {
  client_id: string;
  scope?: string;
  iat: number;
  exp: number;
  access_tokens: string[];
  user_id?: string;
  username?: string;
  sub?: string;
  workspace_id?: string;
  organisation_id?: string;
  is_external_auth?: boolean;
  server_id?: string;
  external_refresh_token?: string;
}

interface StoredAuthCode {
  client_id: string;
  redirect_uri: string;
  scope?: string;
  code_challenge?: string;
  code_challenge_method?: 'S256' | 'plain';
  resource?: string;
  user_id: string;
  /** ms epoch */
  expires: number;
}

let oauthStore: McpCacheService;
let mcpServerCache: McpCacheService;
// let localCache: CacheService = new CacheService({
//   backend: 'memory',
//   defaultTtl: 30 * 1000, // 30 seconds
//   cleanupInterval: 30 * 1000, // 30 seconds
//   maxSize: 100,
// });

// Helper for caching OAuth data
// Maintain connections with cache store and control plane
// Control Plane <-> Persistent Cache <-> Memory Cache
const OAuthGatewayCache = {
  get: async <T = any | null>(key: string, namespace?: string): Promise<T> => {
    // Check in memory cache first
    // const inMemory = await localCache.get(key, namespace);
    // if (inMemory) {
    //   return inMemory;
    // }

    // Then check persistent cache
    const persistent = await oauthStore.get<T>(key, namespace);
    if (persistent) {
      // Store in memory cache
      return persistent;
    }

    // TODO: Then check control plane

    return null as T;
  },

  set: async <T = any>(
    key: string,
    value: T,
    namespace?: string,
    ttlMs?: number
  ): Promise<void> => {
    try {
      await oauthStore.set(key, value, { namespace, ttl: ttlMs });
    } catch (e) {
      logger.error('Error setting in oauthstore', e);
    }
  },

  delete: async (key: string, namespace?: string): Promise<void> => {
    // TODO: If control plane exists, we should never get here
    await oauthStore.delete(key, namespace);
  },
};

/**
 * Unified OAuth gateway that routes requests to either control plane or local service
 */
export class OAuthGateway {
  private controlPlaneUrl: string | null;
  private c: Context;
  constructor(c: Context) {
    this.controlPlaneUrl = env(c).ALBUS_BASEPATH || null;
    this.c = c;

    if (!oauthStore) {
      oauthStore = getOauthStore();
    }

    if (!mcpServerCache) {
      mcpServerCache = getMcpServersCache();
    }
  }

  get controlPlane(): ControlPlane | null {
    return this.c.get('controlPlane');
  }

  private parseClientCredentials(
    headers: Headers,
    params: URLSearchParams
  ): { clientId: string; clientSecret: string } {
    let clientId = '';
    let clientSecret = '';
    const authHeader = headers.get('Authorization');
    if (authHeader?.startsWith('Basic ')) {
      const base64Credentials = authHeader.slice(6);
      const credentials = Buffer.from(base64Credentials, 'base64').toString(
        'utf-8'
      );
      [clientId, clientSecret] = credentials.split(':');
    } else {
      clientId = params.get('client_id') || '';
      clientSecret = params.get('client_secret') || '';
    }
    return { clientId, clientSecret };
  }

  private async storeAccessToken(
    clientId: string,
    scope?: string,
    userId?: string
  ): Promise<{ token: string; expiresIn: number; iat: number; exp: number }> {
    const token = `mcp_${crypto.randomBytes(32).toString('hex')}`;
    const iat = nowSec();
    const exp = iat + ACCESS_TOKEN_TTL_SECONDS;
    await oauthStore.set<StoredAccessToken>(
      token,
      {
        client_id: clientId,
        active: true,
        scope,
        iat,
        exp,
        user_id: userId,
      },
      { namespace: 'tokens' }
    );
    return {
      token,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      iat,
      exp,
    };
  }

  private async storeRefreshToken(
    clientId: string,
    scope: string | undefined,
    initialAccessToken: string,
    userId?: string
  ): Promise<{ refreshToken: string; iat: number; exp: number }> {
    const refreshToken = `mcp_refresh_${crypto.randomBytes(32).toString('hex')}`;
    const iat = nowSec();
    const exp = iat + REFRESH_TOKEN_TTL_SECONDS;
    await oauthStore.set<StoredRefreshToken>(
      refreshToken,
      {
        client_id: clientId,
        scope,
        iat,
        exp,
        access_tokens: [initialAccessToken],
        user_id: userId,
      },
      { namespace: 'refresh_tokens' }
    );

    // Also store this refresh token against a client_id for fast revocation
    await oauthStore.set(clientId, refreshToken, {
      namespace: 'clientid_refresh',
    });
    return { refreshToken, iat, exp };
  }

  private errorInvalidRequest(error_description: string) {
    return { error: 'invalid_request', error_description };
  }

  private errorInvalidGrant(error_description: string) {
    return { error: 'invalid_grant', error_description };
  }

  private errorInvalidClient(error_description: string) {
    return { error: 'invalid_client', error_description };
  }

  private isPublicClient(client: any): boolean {
    return (
      client?.token_endpoint_auth_method === 'none' || !client?.client_secret
    );
  }

  /**
   * Check if using control plane or local OAuth
   */
  get isUsingControlPlane(): boolean {
    return !!this.controlPlaneUrl;
  }

  /**
   * Handle token request
   */
  async handleTokenRequest(
    params: URLSearchParams,
    headers: Headers
  ): Promise<any> {
    const grantType = params.get('grant_type') as GrantType | null;
    const code = params.get('code');

    // Check if this is an external auth code - handle locally instead of control plane
    if (grantType === 'authorization_code' && code) {
      const authCodeData = await OAuthGatewayCache.get<
        StoredAuthCode & { is_external_auth?: boolean }
      >(code, 'authorization_codes');

      // If this is an external auth code, handle it locally
      if (authCodeData?.is_external_auth) {
        return this.handleExternalAuthTokenRequest(
          params,
          headers,
          authCodeData
        );
      }
    }

    // Check if this is an external auth refresh token - handle locally
    // Control plane tokens start with 'prt_', external tokens don't have this prefix
    if (grantType === 'refresh_token') {
      const refreshToken = params.get('refresh_token');
      if (refreshToken && !refreshToken.startsWith('prt_')) {
        // Not a control plane token - this is an external auth refresh
        // Try to get stored metadata for additional context (workspace_id, server_id, etc.)
        const storedRefreshToken =
          await OAuthGatewayCache.get<StoredRefreshToken>(
            refreshToken,
            'refresh_tokens'
          );

        return this.handleExternalAuthRefreshRequest(
          params,
          headers,
          storedRefreshToken
        );
      }
    }

    // For control plane tokens (prt_*), delegate to control plane if available
    if (this.isUsingControlPlane) {
      const CP = this.c.get('controlPlane');
      if (CP) {
        return CP.token(params, headers, oauthStore);
      }
    }

    const { clientId, clientSecret } = this.parseClientCredentials(
      headers,
      params
    );

    if (grantType === 'authorization_code') {
      const redirectUri = params.get('redirect_uri');
      const codeVerifier = params.get('code_verifier');
      if (!code || !redirectUri) {
        return this.errorInvalidRequest(
          'Missing required parameters: code and redirect_uri are required'
        );
      }

      const authCodeData = await OAuthGatewayCache.get<StoredAuthCode>(
        code,
        'authorization_codes'
      );
      if (!authCodeData || authCodeData.expires < Date.now()) {
        return this.errorInvalidGrant('Invalid or expired authorization code');
      }

      if (
        authCodeData.client_id !== clientId ||
        authCodeData.redirect_uri !== redirectUri
      ) {
        return this.errorInvalidGrant('Client or redirect_uri mismatch');
      }

      // Check if the client exists
      const client = await OAuthGatewayCache.get<OAuthClient>(
        clientId,
        'clients'
      );
      if (!client) {
        return this.errorInvalidClient('Client not found');
      }

      if (client.client_secret && client.client_secret !== clientSecret) {
        return this.errorInvalidClient('Invalid client credentials');
      }

      if (this.isPublicClient(client) && !authCodeData.code_challenge) {
        return this.errorInvalidRequest('PKCE required for public clients');
      }

      if (authCodeData.code_challenge) {
        if (!codeVerifier) {
          return {
            error: 'invalid_request',
            error_description: 'Code verifier required',
          };
        }
        if (
          !(await verifyCodeChallenge(
            codeVerifier,
            authCodeData.code_challenge,
            authCodeData.code_challenge_method || 'S256'
          ))
        ) {
          return this.errorInvalidGrant('Invalid code verifier');
        }
      }

      // Delete the authorization code
      await oauthStore.delete(code, 'authorization_codes');

      if (!authCodeData.user_id) {
        logger.warn('No user ID found in authCodeData');
        return this.errorInvalidGrant(
          'User ID not found in authorization code'
        );
      }

      // Use the scope from the authorization code, or default to allowed scopes
      const tokenScope = authCodeData.scope || client.scope;

      // Store access token
      const access = await this.storeAccessToken(
        clientId,
        tokenScope,
        authCodeData.user_id
      );

      // Store refresh token
      const refresh = await this.storeRefreshToken(
        clientId,
        tokenScope,
        access.token,
        authCodeData.user_id
      );

      return {
        access_token: access.token,
        token_type: 'Bearer',
        expires_in: access.expiresIn,
        scope: tokenScope,
        refresh_token: refresh.refreshToken,
      };
    }

    if (grantType === 'refresh_token') {
      const refreshToken = params.get('refresh_token');
      if (!refreshToken) {
        return this.errorInvalidRequest('Missing refresh_token parameter');
      }

      const storedRefreshToken =
        await OAuthGatewayCache.get<StoredRefreshToken>(
          refreshToken,
          'refresh_tokens'
        );
      if (!storedRefreshToken || storedRefreshToken.exp < nowSec()) {
        return this.errorInvalidGrant('Invalid or expired refresh token');
      }

      // Enforce client authentication/match for refresh_token grant
      const client = await OAuthGatewayCache.get<OAuthClient>(
        storedRefreshToken.client_id,
        'clients'
      );
      if (!client) {
        return this.errorInvalidClient('Client not found');
      }
      const isPublic = client.token_endpoint_auth_method === 'none';
      if (!isPublic) {
        if (!clientId || clientId !== storedRefreshToken.client_id) {
          return this.errorInvalidClient('Client mismatch');
        }
        if (client.client_secret && client.client_secret !== clientSecret) {
          return this.errorInvalidClient('Invalid client credentials');
        }
      }

      const access = await this.storeAccessToken(
        storedRefreshToken.client_id,
        storedRefreshToken.scope,
        storedRefreshToken.user_id
      );

      storedRefreshToken.access_tokens.push(access.token);
      await oauthStore.set<StoredRefreshToken>(
        refreshToken,
        storedRefreshToken,
        {
          namespace: 'refresh_tokens',
        }
      );

      return {
        access_token: access.token,
        token_type: 'Bearer',
        expires_in: access.expiresIn,
        scope: storedRefreshToken.scope,
        refresh_token: refreshToken,
      };
    }

    if (grantType === 'client_credentials') {
      // Check if client exists
      const client = await OAuthGatewayCache.get<OAuthClient>(
        clientId,
        'clients'
      );
      if (!client) {
        return this.errorInvalidClient('Client not found');
      }

      if (client.client_secret && client.client_secret !== clientSecret) {
        return this.errorInvalidClient('Invalid client credentials');
      }

      // Generate tokens

      // Store access token
      const access = await this.storeAccessToken(clientId, client.scope);

      return {
        access_token: access.token,
        token_type: 'Bearer',
        expires_in: access.expiresIn,
        scope: client.scope,
      };
    }

    return this.errorInvalidGrant('Unsupported grant type');
  }

  /**
   * Handle token request for external auth codes
   * Pass through the external tokens directly (simplified flow)
   */
  private async handleExternalAuthTokenRequest(
    params: URLSearchParams,
    headers: Headers,
    authCodeData: StoredAuthCode & {
      is_external_auth?: boolean;
      external_tokens?: any;
      workspace_id?: string;
      server_id?: string;
      organisation_id?: string;
    }
  ): Promise<any> {
    const { clientId } = this.parseClientCredentials(headers, params);
    const redirectUri = params.get('redirect_uri');
    const codeVerifier = params.get('code_verifier');
    const code = params.get('code');

    if (!code || !redirectUri) {
      return this.errorInvalidRequest(
        'Missing required parameters: code and redirect_uri are required'
      );
    }

    if (authCodeData.expires < Date.now()) {
      return this.errorInvalidGrant('Invalid or expired authorization code');
    }

    if (
      authCodeData.client_id !== clientId ||
      authCodeData.redirect_uri !== redirectUri
    ) {
      return this.errorInvalidGrant('Client or redirect_uri mismatch');
    }

    // Verify PKCE if the client provided a code_challenge
    if (authCodeData.code_challenge) {
      if (!codeVerifier) {
        return {
          error: 'invalid_request',
          error_description: 'Code verifier required',
        };
      }
      if (
        !(await verifyCodeChallenge(
          codeVerifier,
          authCodeData.code_challenge,
          authCodeData.code_challenge_method || 'S256'
        ))
      ) {
        return this.errorInvalidGrant('Invalid code verifier');
      }
    }

    // Delete the authorization code (one-time use)
    await oauthStore.delete(code, 'authorization_codes');

    // Return the external tokens directly (pass-through)
    if (!authCodeData.external_tokens) {
      return this.errorInvalidGrant('External tokens not found');
    }

    const externalTokens = authCodeData.external_tokens;

    // Store token metadata so introspection can find it
    // This allows the gateway to validate the token without calling external provider
    if (externalTokens.access_token) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const expiresIn = externalTokens.expires_in || 3600;

      await OAuthGatewayCache.set(
        externalTokens.access_token,
        {
          client_id: clientId,
          active: true,
          scope: externalTokens.scope || authCodeData.scope,
          iat: nowSeconds,
          exp: nowSeconds + expiresIn,
          user_id: 'external_user',
          workspace_id: authCodeData.workspace_id,
          organisation_id: authCodeData.organisation_id,
          is_external_auth: true,
          server_id: authCodeData.server_id,
        },
        'tokens',
        expiresIn * 1000 // TTL in milliseconds based on token expiry
      );
    }

    // Store external refresh token metadata for token refresh handling
    if (externalTokens.refresh_token) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      // External refresh tokens typically have longer expiry, default to 30 days
      const refreshExpiresIn =
        externalTokens.refresh_expires_in || 30 * 24 * 3600;

      await OAuthGatewayCache.set<StoredRefreshToken>(
        externalTokens.refresh_token,
        {
          client_id: clientId,
          scope: externalTokens.scope || authCodeData.scope,
          iat: nowSeconds,
          exp: nowSeconds + refreshExpiresIn,
          access_tokens: [externalTokens.access_token],
          user_id: 'external_user',
          workspace_id: authCodeData.workspace_id,
          organisation_id: authCodeData.organisation_id,
          is_external_auth: true,
          server_id: authCodeData.server_id,
          external_refresh_token: externalTokens.refresh_token,
        },
        'refresh_tokens',
        refreshExpiresIn * 1000 // TTL in milliseconds based on refresh token expiry
      );
    }

    logger.info('External auth tokens passed through', {
      clientId,
      workspaceId: authCodeData.workspace_id,
      serverId: authCodeData.server_id,
    });

    // Return external tokens directly to MCP client
    return externalTokens;
  }

  /**
   * Handle token refresh for external auth
   * Refreshes tokens with the external auth provider
   */
  private async handleExternalAuthRefreshRequest(
    params: URLSearchParams,
    headers: Headers,
    storedRefreshToken: StoredRefreshToken | null
  ): Promise<any> {
    const { clientId } = this.parseClientCredentials(headers, params);
    const refreshToken = params.get('refresh_token');

    if (!refreshToken) {
      return this.errorInvalidRequest('Missing refresh_token parameter');
    }

    // Check expiry if we have stored metadata
    if (storedRefreshToken && storedRefreshToken.exp < nowSec()) {
      return this.errorInvalidGrant('Invalid or expired refresh token');
    }

    // Verify client matches if we have stored metadata
    if (
      storedRefreshToken &&
      clientId &&
      clientId !== storedRefreshToken.client_id
    ) {
      return this.errorInvalidClient('Client mismatch');
    }

    // Get workspace_id and server_id from stored token or request context
    // Try: 1) stored token metadata, 2) resource param, 3) URL params
    let workspaceId = storedRefreshToken?.workspace_id || '';
    let serverId = storedRefreshToken?.server_id || '';
    const organisationId = storedRefreshToken?.organisation_id;

    // If not in stored token, try to extract from resource parameter
    if (!workspaceId || !serverId) {
      const resourceUrl = params.get('resource');
      if (resourceUrl) {
        const parts = resourceUrl.split('/');
        // URL format: .../workspace_id/server_id/...
        serverId = serverId || parts.at(-2) || '';
        workspaceId = workspaceId || parts.at(-3) || '';
      }
    }

    if (!workspaceId || !serverId) {
      logger.error(
        'Cannot determine workspace/server for external auth refresh',
        {
          hasStoredToken: !!storedRefreshToken,
          workspaceId,
          serverId,
        }
      );
      return this.errorInvalidGrant(
        'Missing workspace or server context for token refresh'
      );
    }

    // Get server config to find external auth endpoint
    const serverConfig = await getServerConfig(
      workspaceId,
      serverId,
      this.c,
      organisationId
    );

    if (!serverConfig?.external_auth_config?.token_endpoint) {
      logger.error('External auth config not found for refresh', {
        serverId,
        workspaceId,
      });
      return this.errorInvalidGrant('External auth configuration not found');
    }

    const externalAuthConfig = serverConfig.external_auth_config;

    // Exchange refresh token with external auth provider
    const body = new URLSearchParams();
    body.set('grant_type', 'refresh_token');
    body.set('refresh_token', refreshToken);
    body.set(
      'client_id',
      externalAuthConfig.client_id ||
        storedRefreshToken?.client_id ||
        clientId ||
        ''
    );

    if (externalAuthConfig.client_secret) {
      body.set('client_secret', externalAuthConfig.client_secret);
    }

    logger.debug('Refreshing token with external auth provider', {
      tokenEndpoint: externalAuthConfig.token_endpoint,
      serverId,
    });

    try {
      const response = await fetch(externalAuthConfig.token_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      const tokenResponse: {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        refresh_expires_in?: number;
        scope?: string;
        error?: string;
        error_description?: string;
      } = await response.json();

      if (!response.ok || tokenResponse.error) {
        logger.error('External auth refresh failed', {
          status: response.status,
          error: tokenResponse.error,
        });
        return {
          error: tokenResponse.error || 'external_auth_failed',
          error_description:
            tokenResponse.error_description ||
            'Failed to refresh external token',
        };
      }

      // Determine effective client_id and scope
      const effectiveClientId = storedRefreshToken?.client_id || clientId || '';
      const effectiveScope = tokenResponse.scope || storedRefreshToken?.scope;

      // Store new access token metadata
      if (tokenResponse.access_token) {
        const nowSeconds = Math.floor(Date.now() / 1000);
        const expiresIn = tokenResponse.expires_in || 3600;

        await OAuthGatewayCache.set(
          tokenResponse.access_token,
          {
            client_id: effectiveClientId,
            active: true,
            scope: effectiveScope,
            iat: nowSeconds,
            exp: nowSeconds + expiresIn,
            user_id: 'external_user',
            workspace_id: workspaceId,
            organisation_id: organisationId,
            is_external_auth: true,
            server_id: serverId,
          },
          'tokens',
          expiresIn * 1000 // TTL in milliseconds based on token expiry
        );

        // Update access_tokens list in refresh token if we have one
        if (storedRefreshToken) {
          storedRefreshToken.access_tokens.push(tokenResponse.access_token);
        }
      }

      // Update refresh token if a new one was issued
      if (
        tokenResponse.refresh_token &&
        tokenResponse.refresh_token !== refreshToken
      ) {
        const nowSeconds = Math.floor(Date.now() / 1000);
        const refreshExpiresIn =
          tokenResponse.refresh_expires_in || 30 * 24 * 3600;

        // Delete old refresh token if it was stored
        if (storedRefreshToken) {
          await oauthStore.delete(refreshToken, 'refresh_tokens');
        }

        // Store new refresh token
        await OAuthGatewayCache.set<StoredRefreshToken>(
          tokenResponse.refresh_token,
          {
            client_id: effectiveClientId,
            scope: effectiveScope,
            iat: nowSeconds,
            exp: nowSeconds + refreshExpiresIn,
            access_tokens: storedRefreshToken?.access_tokens || [],
            user_id: 'external_user',
            workspace_id: workspaceId,
            organisation_id: organisationId,
            is_external_auth: true,
            server_id: serverId,
            external_refresh_token: tokenResponse.refresh_token,
          },
          'refresh_tokens',
          refreshExpiresIn * 1000 // TTL in milliseconds based on refresh token expiry
        );
      } else if (storedRefreshToken) {
        // Update existing refresh token with new access token list
        // Use remaining TTL based on original expiry
        const remainingTtl = Math.max(
          0,
          (storedRefreshToken.exp - Math.floor(Date.now() / 1000)) * 1000
        );
        await OAuthGatewayCache.set<StoredRefreshToken>(
          refreshToken,
          storedRefreshToken,
          'refresh_tokens',
          remainingTtl || 30 * 24 * 3600 * 1000 // Use remaining TTL or default 30 days
        );
      }

      // Update cached external tokens for this server
      const cacheKey = `external::${workspaceId}::${serverId}`;
      await mcpServerCache.set(cacheKey, tokenResponse, {
        namespace: 'tokens',
        ttl: tokenResponse.expires_in
          ? tokenResponse.expires_in * 1000
          : 3600 * 1000,
      });

      // Track this external token key for invalidation when server config changes
      if (organisationId) {
        const fullTokenKey = `tokens:${cacheKey}`;
        trackMcpServerTokenKey(
          organisationId,
          workspaceId,
          serverId,
          fullTokenKey
        );
      }

      logger.info('External auth tokens refreshed', {
        clientId: effectiveClientId,
        workspaceId,
        serverId,
      });

      return tokenResponse;
    } catch (error) {
      logger.error('Failed to refresh external auth token', error);
      return {
        error: 'external_auth_failed',
        error_description: 'Failed to communicate with external auth provider',
      };
    }
  }

  /**
   * Introspect token
   */
  async introspectToken(
    token: string,
    hint: 'access_token' | 'refresh_token' | ''
  ): Promise<TokenIntrospectionResponse> {
    if (!token) return { active: false };

    const fromAccess =
      !hint || hint === 'access_token'
        ? await OAuthGatewayCache.get<StoredAccessToken>(token, 'tokens')
        : null;
    const fromRefresh =
      !fromAccess && (!hint || hint === 'refresh_token')
        ? await OAuthGatewayCache.get<StoredRefreshToken>(
            token,
            'refresh_tokens'
          )
        : null;
    let tok = (fromAccess || fromRefresh) as
      | StoredAccessToken
      | StoredRefreshToken
      | null;

    if (!tok && this.isUsingControlPlane) {
      const CP = this.c.get('controlPlane');
      if (CP) {
        const cpTok = await CP.introspect(token, hint);
        if (cpTok.active) {
          tok = cpTok;
          await OAuthGatewayCache.set(
            token,
            tok,
            hint === 'refresh_token' ? 'refresh_tokens' : 'tokens'
          );
        }
      }
    }

    if (!tok) return { active: false };

    const exp = 'exp' in tok ? tok.exp : undefined;
    if ((exp ?? 0) < nowSec()) return { active: false };

    return {
      active: true,
      scope: tok.scope,
      client_id: tok.client_id,
      username: tok.user_id || tok.username || tok.sub,
      exp: tok.exp,
      iat: tok.iat,
      workspace_id: tok.workspace_id,
      organisation_id: tok.organisation_id,
      // Server ID if the token is scoped to a specific MCP server
      server_id: (tok as any).server_id,
      // Audience claim for resource binding validation
      aud: (tok as any).aud,
      // Extended workspace metadata (from control plane introspection)
      organisation_name: (tok as any).organisation_name,
      workspace_name: (tok as any).workspace_name,
      workspace_slug: (tok as any).workspace_slug,
      // Full organisation details for rich logging
      _organisationDetails: (tok as any)._organisationDetails,
      email: (tok as any).email,
    };
  }

  /**
   * Register client
   */
  async registerClient(
    clientData: OAuthClient,
    clientId?: string
  ): Promise<any> {
    logger.debug(`Registering client`, { clientData, clientId });
    if (this.isUsingControlPlane) {
      const CP = this.c.get('controlPlane');
      if (CP) {
        return CP.register(clientData);
      }
    }

    // Create a new client id if not provided by hashing clientData to avoid duplicates
    if (!clientId) {
      clientId = crypto
        .createHash('sha256')
        .update(JSON.stringify(clientData))
        .digest('hex');
    }

    const id = clientId;

    const existing = await OAuthGatewayCache.get<OAuthClient>(id, 'clients');
    if (existing) {
      if (clientData.redirect_uris?.length) {
        const merged = Array.from(
          new Set([
            ...(existing.redirect_uris || []),
            ...clientData.redirect_uris,
          ])
        );
        await oauthStore.set<OAuthClient>(
          id,
          { ...existing, redirect_uris: merged },
          { namespace: 'clients' }
        );
      }

      return (await OAuthGatewayCache.get<OAuthClient>(id, 'clients'))!;
    }

    const isPublicClient =
      clientData.token_endpoint_auth_method === 'none' ||
      (clientData.grant_types?.includes('authorization_code') &&
        !clientData.grant_types?.includes('client_credentials'));

    const newClient: OAuthClient = {
      client_id: id,
      client_name: clientData.client_name,
      scope: clientData.scope,
      redirect_uris: clientData.redirect_uris,
      grant_types: clientData.grant_types || ['client_credentials'],
      token_endpoint_auth_method: isPublicClient
        ? 'none'
        : 'client_secret_post',
      client_secret: isPublicClient
        ? undefined
        : `mcp_secret_${crypto.randomBytes(32).toString('hex')}`,
      client_uri: clientData.client_uri,
      logo_uri: clientData.logo_uri,
    };

    await oauthStore.set<OAuthClient>(id, newClient, {
      namespace: 'clients',
    });
    logger.debug(`Registered client`, { id });
    return newClient;
  }

  /**
   * Revoke token
   */
  async revokeToken(
    token: string,
    token_type_hint: string,
    client_id: string,
    authHeader?: string
  ): Promise<void> {
    let clientId: string, clientSecret: string;

    if (authHeader?.startsWith('Basic ')) {
      const base64Credentials = authHeader.slice(6);
      const credentials = Buffer.from(base64Credentials, 'base64').toString(
        'utf-8'
      );
      [clientId, clientSecret] = credentials.split(':');

      const client = await OAuthGatewayCache.get<OAuthClient>(
        clientId,
        'clients'
      );
      if (!client || client.client_secret !== clientSecret) return;
    } else if (client_id) {
      clientId = client_id;
      const client = await OAuthGatewayCache.get<OAuthClient>(
        clientId,
        'clients'
      );
      if (!client || client.token_endpoint_auth_method !== 'none') return;
    } else {
      return;
    }

    if (!token) return;

    // Try control plane first if available
    if (this.isUsingControlPlane && this.controlPlane) {
      try {
        await this.controlPlane.revoke(
          token,
          token_type_hint as 'access_token' | 'refresh_token' | undefined,
          clientId
        );
      } catch (error) {
        logger.warn(
          'Control plane revocation failed, will continue with local',
          error
        );
      }
    }

    // Always revoke locally (for cache cleanup)
    await revokeOAuthToken(
      token,
      clientId,
      token_type_hint as 'access_token' | 'refresh_token' | undefined
    );
  }

  async startAuthorization(): Promise<any> {
    const params = this.c.req.query();
    const resourceUrl = params.resource;
    const resourceId = this.c.req.param('resourceId');
    const workspaceId = this.c.req.param('workspaceId');

    // Check if the server has external auth config - this replaces control plane auth
    if (resourceUrl || (resourceId && workspaceId)) {
      const serverId =
        resourceId || Array.from(resourceUrl?.split('/') || []).at(-2);
      const wsId =
        workspaceId || Array.from(resourceUrl?.split('/') || []).at(-3);

      if (serverId && wsId) {
        const serverConfig = await getServerConfig(wsId, serverId, this.c);

        if (serverConfig?.external_auth_config) {
          // External auth is only allowed for enterprise deployments
          if (isManagedDeployment()) {
            logger.warn(
              `External auth attempted in managed deployment for ${wsId}/${serverId}`
            );
            return this.c.json(
              {
                error: 'forbidden',
                error_description:
                  'External authentication is only available for enterprise deployments',
              },
              403
            );
          }
          // External auth replaces control plane - redirect directly to external auth provider
          return this.startExternalAuthorization(serverConfig, params);
        }
      }
    }

    if (this.isUsingControlPlane) {
      const CP = this.c.get('controlPlane');
      if (CP) {
        const result = await CP.authorize(this.c, oauthStore);
        if (result.status >= 300 && result.status < 400) {
          return this.c.redirect(result.location, result.status as any);
        }
        return result;
      }
    }

    const clientId = params.client_id;
    const redirectUri = params.redirect_uri;
    const state = params.state;
    const scope = params.scope || 'mcp:*';
    const codeChallenge = params.code_challenge;
    const codeChallengeMethod = params.code_challenge_method;

    if (!resourceUrl) {
      return this.c.json(
        this.errorInvalidRequest('Missing resource parameter'),
        400
      );
    }

    const client = await OAuthGatewayCache.get<OAuthClient>(
      clientId,
      'clients'
    );
    if (!client)
      return this.c.json(this.errorInvalidClient('Client not found'), 400);

    const user_id = 'portkeydefaultuser';

    let resourceAuthUrl = null;
    const upstream = await this.checkUpstreamAuth(resourceUrl, user_id);
    if (upstream.status === 'auth_needed')
      resourceAuthUrl = upstream.authorizationUrl;

    const authorizationUrl = `/oauth/authorize`;

    return this.c.html(`
      <html>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:400px;margin:80px auto;padding:20px;color:#333">
  <h1 style="font-size:24px;font-weight:500;margin-bottom:30px">Authorization Request</h1>
  <p style="margin:20px 0;color:#666">Requesting access to: <b>${Array.from(resourceUrl.split('/')).at(-2)}</b></p>
  <p style="margin:20px 0;color:#666">Redirect URI: ${redirectUri}</p>
  ${resourceAuthUrl ? `<p style="background:#fffbf0;border-left:3px solid #ffa500;padding:12px;margin:20px 0">Auth to upstream MCP first: <a href="${resourceAuthUrl}" target="_blank" style="color:#0066cc">Click here to authorize</a></p>` : ''}
  <form action="${authorizationUrl}" method="post" style="margin-top:40px">
    <input type="hidden" name="user_id" value="portkeydefaultuser" />
    <input type="hidden" name="client_id" value="${clientId}" />
    <input type="hidden" name="redirect_uri" value="${redirectUri}" />
    <input type="hidden" name="state" value="${state}" />
    <input type="hidden" name="scope" value="${scope}" />
    <input type="hidden" name="code_challenge" value="${codeChallenge}" />
    <input type="hidden" name="code_challenge_method" value="${codeChallengeMethod}" />
    <input type="hidden" name="resource" value="${resourceUrl}" />
    <div style="text-align:right">
      <button type="submit" name="action" value="deny" style="padding:10px 20px;margin-right:10px;background:#f5f5f5;border:none;border-radius:4px;cursor:pointer">Deny</button>
      <button type="submit" name="action" value="approve" style="padding:10px 20px;background:#000;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:500">
        🔒 Approve
      </button>
    </div>
  </form>
</body>
</html>
    `);
  }

  /**
   * Start external authorization flow - replaces control plane OAuth
   * Redirects directly to the external auth provider
   */
  private async startExternalAuthorization(
    serverConfig: any,
    params: Record<string, string>
  ): Promise<any> {
    const externalAuthConfig = serverConfig.external_auth_config;
    const clientId = params.client_id;
    const redirectUri = params.redirect_uri;
    const state = params.state;
    const scope = params.scope || externalAuthConfig.scope || 'openid';
    // These are the MCP client's PKCE params - stored for later when we issue tokens to them
    const clientCodeChallenge = params.code_challenge;
    const clientCodeChallengeMethod = params.code_challenge_method;

    // Generate gateway state to track this flow
    const gatewayState = crypto.randomBytes(16).toString('hex');

    // Generate GATEWAY's own PKCE for the external auth provider
    // (This is separate from the MCP client's PKCE)
    const gatewayCodeVerifier = crypto.randomBytes(32).toString('base64url');
    const gatewayCodeChallenge = crypto
      .createHash('sha256')
      .update(gatewayCodeVerifier)
      .digest('base64url');

    // Store the original request data for callback
    await oauthStore.set(
      gatewayState,
      {
        gateway_state: gatewayState,
        server_id: serverConfig.serverId,
        workspace_id: serverConfig.workspaceId,
        organisation_id: serverConfig.organisationId,
        client_id: clientId,
        redirect_uri: redirectUri,
        original_state: state,
        scope: scope,
        // MCP client's PKCE (for issuing tokens back to them)
        code_challenge: clientCodeChallenge,
        code_challenge_method: clientCodeChallengeMethod,
        // Gateway's PKCE (for external auth provider)
        gateway_code_verifier: gatewayCodeVerifier,
        is_external_auth: true,
      },
      { namespace: 'gateway_state', ttl: 10 * 60 * 1000 }
    );

    // Build the external authorization URL
    const authUrl = new URL(externalAuthConfig.authorization_endpoint);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set(
      'client_id',
      externalAuthConfig.client_id || clientId
    );
    authUrl.searchParams.set('redirect_uri', this.getExternalAuthCallbackUrl());
    authUrl.searchParams.set('state', gatewayState);
    authUrl.searchParams.set('scope', scope);

    // Use GATEWAY's code_challenge for external auth provider
    authUrl.searchParams.set('code_challenge', gatewayCodeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    logger.info('Redirecting to external auth provider', {
      serverId: serverConfig.serverId,
      authUrl: authUrl.toString(),
    });

    return this.c.redirect(authUrl.toString(), 302);
  }

  /**
   * Get the callback URL for external auth
   */
  private getExternalAuthCallbackUrl(): string {
    // Priority: env var > incoming request URL > localhost fallback
    const baseUrl =
      Environment({}).MCP_GATEWAY_BASE_URL ||
      getBaseUrl(this.c).origin ||
      `http://localhost:${Environment({}).MCP_PORT || 8787}`;
    return `${baseUrl}/oauth/external-callback`;
  }

  /**
   * Handle callback from external auth provider
   * Exchanges the code for tokens and redirects back to the MCP client
   */
  async handleExternalAuthCallback(): Promise<any> {
    const code = this.c.req.query('code');
    const state = this.c.req.query('state');
    const error = this.c.req.query('error');

    logger.debug('Received external auth callback', {
      hasCode: !!code,
      hasState: !!state,
      error,
    });

    if (error) {
      return this.c.json(
        { error: 'external_auth_failed', error_description: error },
        400
      );
    }

    if (!state) {
      return this.c.json(
        {
          error: 'invalid_state',
          error_description: 'Missing state parameter',
        },
        400
      );
    }

    // Retrieve the stored state
    const storedState = await oauthStore.get(state, 'gateway_state');
    if (!storedState || !storedState.is_external_auth) {
      return this.c.json(
        {
          error: 'invalid_state',
          error_description: 'Invalid or expired state',
        },
        400
      );
    }

    // Get server config for token exchange
    const serverConfig = await getServerConfig(
      storedState.workspace_id,
      storedState.server_id,
      this.c
    );

    if (!serverConfig?.external_auth_config) {
      return this.c.json(
        {
          error: 'invalid_configuration',
          error_description: 'External auth config not found',
        },
        500
      );
    }

    const externalAuthConfig = serverConfig.external_auth_config;

    try {
      // Exchange code for tokens with external auth provider
      const tokenResponse = await this.exchangeExternalAuthCode(
        code!,
        externalAuthConfig,
        storedState
      );

      if (tokenResponse.error) {
        return this.c.json(tokenResponse, 400);
      }

      // Store the external tokens for this server
      const cacheKey = `external::${storedState.workspace_id}::${storedState.server_id}`;
      await mcpServerCache.set(cacheKey, tokenResponse, {
        namespace: 'tokens',
        ttl: tokenResponse.expires_in
          ? tokenResponse.expires_in * 1000
          : 3600 * 1000,
      });

      // Track this external token key for invalidation when server config changes
      if (storedState.organisation_id) {
        const fullTokenKey = `tokens:${cacheKey}`;
        trackMcpServerTokenKey(
          storedState.organisation_id,
          storedState.workspace_id,
          storedState.server_id,
          fullTokenKey
        );
      }

      // Generate gateway's own auth code to return to the MCP client
      const gatewayAuthCode = `authz_${crypto.randomBytes(32).toString('hex')}`;

      // Store auth code data
      await oauthStore.set(
        gatewayAuthCode,
        {
          client_id: storedState.client_id,
          redirect_uri: storedState.redirect_uri,
          scope: storedState.scope,
          code_challenge: storedState.code_challenge,
          code_challenge_method: storedState.code_challenge_method,
          user_id: 'external_user',
          expires: Date.now() + 10 * 60 * 1000,
          is_external_auth: true,
          workspace_id: storedState.workspace_id,
          organisation_id: storedState.organisation_id,
          server_id: storedState.server_id,
          external_tokens: tokenResponse,
        },
        { namespace: 'authorization_codes', ttl: 10 * 60 * 1000 }
      );

      // Clean up gateway state
      await oauthStore.delete(state, 'gateway_state');

      // Redirect back to MCP client with gateway's auth code
      const redirectUrl = new URL(storedState.redirect_uri);
      redirectUrl.searchParams.set('code', gatewayAuthCode);
      if (storedState.original_state) {
        redirectUrl.searchParams.set('state', storedState.original_state);
      }

      logger.info('External auth completed, redirecting to client', {
        serverId: storedState.server_id,
      });

      return this.c.redirect(redirectUrl.toString(), 302);
    } catch (e: any) {
      logger.error('External auth token exchange failed', { error: e.message });
      return this.c.json(
        { error: 'token_exchange_failed', error_description: e.message },
        500
      );
    }
  }

  /**
   * Exchange authorization code with external auth provider
   */
  private async exchangeExternalAuthCode(
    code: string,
    externalAuthConfig: NonNullable<ServerConfig['external_auth_config']>,
    storedState: any
  ): Promise<any> {
    const tokenEndpoint = externalAuthConfig.token_endpoint;

    const body = new URLSearchParams();
    body.set('grant_type', 'authorization_code');
    body.set('code', code);
    body.set('redirect_uri', this.getExternalAuthCallbackUrl());
    body.set(
      'client_id',
      externalAuthConfig.client_id || storedState.client_id
    );

    if (externalAuthConfig.client_secret) {
      body.set('client_secret', externalAuthConfig.client_secret);
    }

    // Include gateway's code_verifier for PKCE
    // This is the verifier we generated in startExternalAuthorization
    if (storedState.gateway_code_verifier) {
      body.set('code_verifier', storedState.gateway_code_verifier);
    }

    logger.debug('Exchanging code with external auth provider', {
      tokenEndpoint,
      hasCodeVerifier: !!storedState.gateway_code_verifier,
    });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const result: any = await response.json();

    if (!response.ok) {
      logger.error('External token exchange failed', { result });
      return {
        error: result.error || 'token_exchange_failed',
        error_description:
          result.error_description || 'Failed to exchange code',
      };
    }

    return result;
  }

  async handleUpstreamAuth(): Promise<any> {
    if (this.isUsingControlPlane) {
      const CP = this.c.get('controlPlane');
      if (CP) {
        const result = await CP.postAuthorize(this.c, oauthStore);
        if (result.status === 'auth_needed' && result.authorizationUrl) {
          return this.c.redirect(result.authorizationUrl, 302);
        }
        return result;
      }
    }
    return null;
  }

  async completeAuthorization(): Promise<any> {
    if (this.isUsingControlPlane) {
      throw new Error('Control plane not supported');
    }
    const formData = await this.c.req.formData();
    const action = formData.get('action');
    const clientId = formData.get('client_id') as string;
    const redirectUri = formData.get('redirect_uri') as string;
    const state = formData.get('state') as string;
    const scope = (formData.get('scope') as string) || 'mcp:servers:read';
    const codeChallenge = formData.get('code_challenge') as string;
    const codeChallengeMethod = formData.get('code_challenge_method') as
      | 'S256'
      | 'plain'
      | undefined;
    const resourceUrl = formData.get('resource') as string;
    const user_id = formData.get('user_id') as string;

    if (action === 'deny') {
      // User denied access
      const denyUrl = new URL(redirectUri);
      denyUrl.searchParams.set('error', 'access_denied');
      if (state) denyUrl.searchParams.set('state', state);

      // Always show intermediate page that triggers redirect and attempts to close
      return this.c.html(`
        <html>
          <head><title>Redirecting...</title></head>
          <body style="font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
            <div style="text-align:center">
              <p>Authorization denied. Redirecting...</p>
              <p style="color:#666;font-size:14px">You may need to allow the redirect in your browser. You can close window once you have approved the redirect.</p>
              <p style="color:#666;font-size:14px">This window will close automatically after redirect</p>
            </div>
            <script>
              // Trigger the redirect
              window.location.href = "${denyUrl.toString()}";
              
              
            </script>
          </body>
        </html>
      `);
    }

    // Create authorization code
    const authCode = `authz_${crypto.randomBytes(32).toString('hex')}`;

    // Store this authCode to cache mapped to client info
    await oauthStore.set<StoredAuthCode>(
      authCode,
      {
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: scope,
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
        resource: resourceUrl,
        user_id: user_id,
        expires: Date.now() + 10 * 60 * 1000, // 10 minutes
      },
      { namespace: 'authorization_codes', ttl: 10 * 60 * 1000 }
    );

    // User approved access
    const ok = new URL(redirectUri);
    ok.searchParams.set('code', authCode);
    if (state) ok.searchParams.set('state', state);

    // Always show intermediate page that triggers redirect and attempts to close
    return this.c.html(`
      <html>
        <head><title>Authorization Complete</title></head>
        <body style="font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
          <div style="text-align:center">
            <h2 style="color:#22c55e">✅ Authorization Complete</h2>
            <p>Redirecting...</p>
            <p style="color:#666;font-size:14px">If you're not redirected automatically, <a href="${ok.toString()}" target="_blank">click here</a>.</p>
            <p style="color:#666;font-size:14px">You can close this window once you have approved the redirect.</p>
          </div>
          <script>
            // Trigger the redirect
            window.location.href = "${ok.toString()}";
            
          </script>
        </body>
      </html>
    `);
  }

  async checkUpstreamAuth(resourceUrl: string, username: string): Promise<any> {
    const serverId = Array.from(resourceUrl.split('/')).at(-2);
    const workspaceId = Array.from(resourceUrl.split('/')).at(-3);
    if (!serverId || !workspaceId) return false;

    const serverConfig = await getServerConfig(workspaceId, serverId, this.c);
    if (!serverConfig) return false;

    if (serverConfig.auth_type != 'oauth_auto') {
      return { status: 'auth_not_needed' };
    }

    // Check if this server uses external auth
    const isExternalAuth = !!serverConfig.external_auth_config;

    const provider = new GatewayOAuthProvider(
      serverConfig,
      username,
      isExternalAuth ? undefined : this.controlPlane ?? undefined,
      undefined,
      undefined,
      isExternalAuth,
      getBaseUrl(this.c).origin
    );

    // Check if the server already has tokens for it
    const tokens = await provider.tokens();
    if (tokens) return { status: 'auth_not_needed' };

    try {
      // Use external auth metadata fetch if external auth is configured
      const fetchFn =
        isExternalAuth && serverConfig.external_auth_config
          ? createExternalAuthMetadataFetch(serverConfig.external_auth_config)
          : createOAuthMetadataFetch(serverConfig);

      const result: AuthResult = await auth(provider, {
        serverUrl: serverConfig.url,
        ...(fetchFn && { fetchFn }),
      });

      logger.debug('Auth result', result);
      return { status: 'auth_not_needed' };
    } catch (error: any) {
      if (error.needsAuthorization && error.authorizationUrl) {
        return {
          status: 'auth_needed',
          authorizationUrl: error.authorizationUrl,
          is_external_auth: isExternalAuth,
        };
      }
      throw error;
    }
  }

  async completeUpstreamAuth(): Promise<any> {
    const code = this.c.req.query('code');
    const state = this.c.req.query('state');
    const error = this.c.req.query('error');

    logger.debug('Received upstream OAuth callback', {
      hasCode: code,
      hasState: state,
      error,
      url: this.c.req.url,
    });

    if (!state)
      return {
        error: 'invalid_state',
        error_description: 'Invalid state in upstream callback',
      };

    const stateCache = await mcpServerCache.get(state, 'upstream_state');
    if (!stateCache)
      return {
        error: 'invalid_state',
        error_description: 'Invalid state in upstream callback',
      };

    const resumeStateCache = await oauthStore.get(
      stateCache.resume_state_key,
      'gateway_state'
    );
    if (!resumeStateCache)
      return {
        error: 'invalid_state',
        error_description: 'Invalid resume state in upstream callback',
      };
    await oauthStore.delete(stateCache.resume_state_key, 'gateway_state');
    const serverConfig = await getServerConfig(
      resumeStateCache.workspace_id,
      resumeStateCache.server_id,
      this.c,
      resumeStateCache.organisation_id
    );
    if (!serverConfig)
      return {
        error: 'invalid_state',
        error_description: 'Server config not found',
      };

    // Check if this is external auth flow
    const isExternalAuth =
      resumeStateCache.is_external_auth || !!serverConfig.external_auth_config;

    const provider = new GatewayOAuthProvider(
      serverConfig,
      resumeStateCache.user_id,
      isExternalAuth ? undefined : this.controlPlane ?? undefined,
      state,
      undefined,
      isExternalAuth,
      getBaseUrl(this.c).origin
    );

    try {
      // Use external auth metadata fetch if external auth is configured
      const fetchFn =
        isExternalAuth && serverConfig.external_auth_config
          ? createExternalAuthMetadataFetch(serverConfig.external_auth_config)
          : createOAuthMetadataFetch(serverConfig);

      const result: AuthResult = await auth(provider, {
        serverUrl: serverConfig.url,
        authorizationCode: code,
        ...(fetchFn && { fetchFn }),
      });

      logger.debug('Auth result', result);
      // User approved access
      const ok = new URL(resumeStateCache.redirect_uri);
      ok.searchParams.set('code', resumeStateCache.code);
      if (resumeStateCache.state)
        ok.searchParams.set('state', resumeStateCache.state);

      await oauthStore.set(
        resumeStateCache.code,
        {
          ...resumeStateCache,
          tokens: await provider.tokens(),
          client_metadata: await stateCache.client_metadata,
          is_external_auth: isExternalAuth,
        },
        {
          namespace: 'auth_codes',
          ttl: 5 * 60 * 1000,
        }
      );
      await mcpServerCache.delete(state, 'upstream_state');
      return {
        status: result === 'AUTHORIZED' ? 'auth_completed' : 'auth_failed',
        location: ok.toString(),
      };
    } catch (e: any) {
      await mcpServerCache.delete(state, 'upstream_state');
      if (e.cause && e.cause instanceof Response) {
        try {
          const errorBody = await e.cause.text();
          logger.error('Token exchange failed - Server Error', {
            status: e.cause.status,
            statusText: e.cause.statusText,
            url: e.cause.url,
            body: errorBody, // This should show the actual error message from the server
            headers: Object.fromEntries(e.cause.headers.entries()),
          });
        } catch (readError) {
          logger.error('Could not read error response', { readError });
        }
      } else {
        logger.error('Token exchange failed', {
          error: e.message,
          code: e.code,
          stack: e.stack,
        });
      }

      return {
        error: 'invalid_grant',
        error_description: e.message || 'Failed to exchange authorization code',
      };
    }
  }
}
