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
  CacheService,
  getMcpServersCache,
  getOauthStore,
} from '../../shared/services/cache';
import { getServerConfig } from '../middleware/hydrateContext';
import { GatewayOAuthProvider } from './upstreamOAuth';
import { ControlPlane } from '../middleware/controlPlane';
import { auth, AuthResult } from '@modelcontextprotocol/sdk/client/auth.js';
import { revokeOAuthToken } from '../utils/oauthTokenRevocation';
import { ServerConfig } from '../types/mcp';

const logger = createLogger('OAuthGateway');

const ACCESS_TOKEN_TTL_SECONDS = 3600; // 1 hour
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 3600; // 30 days

const nowSec = () => Math.floor(Date.now() / 1000);

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

let oauthStore: CacheService;
let mcpServerCache: CacheService;
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
    namespace?: string
  ): Promise<void> => {
    try {
      await oauthStore.set(key, value, { namespace });
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

    const grantType = params.get('grant_type') as GrantType | null;

    if (grantType === 'authorization_code') {
      const code = params.get('code');
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
    const gatewayState = crypto.randomBytes(16).toString('hex');
    const resourceId = this.c.req.param('resourceId');
    const redirectUri = this.c.req.query('redirect_uri');
    const state = this.c.req.query('state');
    const clientId = this.c.req.query('client_id');

    const stateData = {
      gateway_state: gatewayState,
      server_id: resourceId,
      redirect_uri: redirectUri,
      client_id: clientId,
      state: state,
    };

    await oauthStore.set(gatewayState, stateData, {
      namespace: 'gateway_state',
      ttl: 10 * 60 * 1000,
    });

    if (this.isUsingControlPlane) {
      const CP = this.c.get('controlPlane');
      if (CP) {
        const result = await CP.authorize(gatewayState, resourceId);
        if (result.status >= 300 && result.status < 400) {
          return this.c.redirect(result.location, result.status as any);
        }
        return result;
      }
    }

    const params = this.c.req.query();
    const scope = params.scope || 'mcp:*';
    const codeChallenge = params.code_challenge;
    const codeChallengeMethod = params.code_challenge_method;
    const resourceUrl = params.resource;

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

    let resourceAuthUrl = null;
    // const user_id = 'portkeydefaultuser';
    // const upstream = await this.checkUpstreamAuth(resourceUrl, user_id);
    // if (upstream.status === 'auth_needed')
    //   resourceAuthUrl = upstream.authorizationUrl;

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

  async postAuthorize(oauthStore: CacheService) {
    logger.debug('Post authorize called');
    const {
      gateway_state: gatewayState,
      resource_id: serverId,
      workspace_id,
      code,
      state,
      upstream_auth_needed,
      organisation_id,
      user_id,
    } = this.c.req.query();
    if (!gatewayState) {
      return this.c.json({ error: 'invalid_request' }, 400);
    }

    const resumeData = await oauthStore.get(gatewayState, 'gateway_state');
    if (!resumeData) {
      return this.c.json({ error: 'invalid_request' }, 400);
    }

    await oauthStore.delete(gatewayState, 'gateway_state');

    if (resumeData.state && resumeData.state !== state) {
      return this.c.json({ error: 'invalid_request' }, 400);
    }
    if (resumeData.server_id !== serverId) {
      return this.c.json({ error: 'invalid_request' }, 400);
    }

    if (upstream_auth_needed) {
      const serverConfig: ServerConfig = await getServerConfig(
        workspace_id,
        serverId,
        this.c,
        organisation_id
      );
      const provider = new GatewayOAuthProvider(
        serverConfig,
        user_id,
        this.c.get('controlPlane') ?? undefined,
        '',
        gatewayState
      );

      // Check if the server already has tokens for it
      const tokens = await provider.tokens();
      if (tokens) return { status: 'auth_not_needed' };

      try {
        const result: AuthResult = await auth(provider, {
          serverUrl: new URL(serverConfig.url),
        });

        logger.debug('Auth result', result);
        return { status: 'auth_not_needed' };
      } catch (error: any) {
        if (error.needsAuthorization && error.authorizationUrl) {
          await oauthStore.set(
            gatewayState,
            {
              ...resumeData,
              server_id: serverId,
              workspace_id: workspace_id,
              organisation_id: organisation_id,
              user_id: user_id,
              code: code,
              state: state,
            },
            { namespace: 'gateway_state', ttl: 10 * 60 * 1000 }
          );

          return {
            status: 'auth_needed',
            authorizationUrl: error.authorizationUrl,
          };
        }
        throw error;
      }
    }
  }

  async handleUpstreamAuth(): Promise<any> {
    const result = await this.postAuthorize(oauthStore);
    logger.debug('Handle upstream auth returned', { result });
    if (
      result &&
      'status' in result &&
      result.status === 'auth_needed' &&
      'authorizationUrl' in result &&
      result.authorizationUrl
    ) {
      return this.c.redirect(result.authorizationUrl as string, 302);
    }
    return result;
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

    // Check if upstream auth is needed
    // const user_id = 'portkeydefaultuser';
    const upstream = await this.checkUpstreamAuth(resourceUrl, user_id);
    if (upstream.status === 'auth_needed') {
      logger.debug('Upstream auth needed, redirecting to upstream auth');
      const gatewayRedirectUrl = new URL(
        `${gateway_base_url}/oauth/upstream-auth`
      );
      gatewayRedirectUrl.searchParams.set('code', authCode);
      gatewayRedirectUrl.searchParams.set('resource_id', upstream.serverId);
      gatewayRedirectUrl.searchParams.set('resource_type', `mcp_servers`);
      gatewayRedirectUrl.searchParams.set('state', state);
      gatewayRedirectUrl.searchParams.set('gateway_state', gatewayState);
      gatewayRedirectUrl.searchParams.set('upstream_auth_needed', 'true');
      gatewayRedirectUrl.searchParams.set('workspace_id', workspaceId);
      gatewayRedirectUrl.searchParams.set(
        'organisation_id',
        store.organisationId
      );
      gatewayRedirectUrl.searchParams.set('user_id', store.userId);

      return res.json({
        redirect_uri: gatewayRedirectUrl.toString(),
      });
      return this.c.redirect(upstream.authorizationUrl as string, 302);
    }

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

    const provider = new GatewayOAuthProvider(
      serverConfig,
      username,
      this.controlPlane ?? undefined
    );

    // Check if the server already has tokens for it
    const tokens = await provider.tokens();
    if (tokens) return { status: 'auth_not_needed' };

    try {
      const result: AuthResult = await auth(provider, {
        serverUrl: serverConfig.url,
      });

      logger.debug('Auth result', result);
      return { status: 'auth_not_needed' };
    } catch (error: any) {
      if (error.needsAuthorization && error.authorizationUrl) {
        return {
          status: 'auth_needed',
          authorizationUrl: error.authorizationUrl,
          serverId: serverId,
          workspaceId: workspaceId,
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

    const provider = new GatewayOAuthProvider(
      serverConfig,
      resumeStateCache.user_id,
      this.controlPlane ?? undefined,
      state
    );

    try {
      const result: AuthResult = await auth(provider, {
        serverUrl: serverConfig.url,
        authorizationCode: code,
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
