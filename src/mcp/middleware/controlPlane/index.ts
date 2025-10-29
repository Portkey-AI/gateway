import { Context } from 'hono';
import { env } from 'hono/adapter';
import { createMiddleware } from 'hono/factory';
import { createLogger } from '../../../shared/utils/logger';

import crypto from 'crypto';
import { auth, AuthResult } from '@modelcontextprotocol/sdk/client/auth.js';
import { GatewayOAuthProvider } from '../../services/upstreamOAuth';
import { ServerConfig } from '../../types/mcp';
import { CacheService } from '../../../shared/services/cache';
import { getBaseUrl } from '../../utils/mcp-utils';
import { getServerConfig } from '../hydrateContext';
import { Environment } from '../../../utils/env';

const logger = createLogger('mcp/controlPlaneMiddleware');

export class ControlPlane {
  private controlPlaneUrl: string;
  private defaultHeaders: Record<string, string>;

  constructor(private c: Context) {
    this.c = c;
    this.controlPlaneUrl = env(c).ALBUS_BASEPATH;

    this.defaultHeaders = {
      'User-Agent': 'Portkey-MCP-Gateway/0.1.0',
      'Content-Type': 'application/json',
    };

    if (env(c).CLIENT_ID) {
      this.defaultHeaders['x-client-id-mcp-gateway'] = `${env(c).CLIENT_ID}`;
    } else if (env(c).PORTKEY_CLIENT_AUTH) {
      this.defaultHeaders['Authorization'] = `${env(c).PORTKEY_CLIENT_AUTH}`;
    }
  }

  async fetch(
    path: string,
    method: string = 'GET',
    headers: any = {},
    body: any = {}
  ) {
    const reqURL = `${this.controlPlaneUrl}/v2${path}`;
    if (
      this.c.get('tokenInfo')?.token &&
      this.c.get('tokenInfo')?.token_type === 'api_key'
    ) {
      headers['x-portkey-api-key'] = this.c.get('tokenInfo').token;
    } else if (this.c.get('tokenInfo')?.token) {
      headers['x-portkey-api-key'] = `Bearer ${this.c.get('tokenInfo').token}`;
    }
    const options: RequestInit = {
      method,
      headers: {
        ...this.defaultHeaders,
        ...headers,
      },
      redirect: 'manual',
    };

    if (method === 'POST' || method === 'PUT') {
      options.body = body;
    }

    logger.debug('Making a request to control plane', { reqURL, options });

    const response = await fetch(reqURL, options);
    if (!response.ok && response.status !== 302) {
      return null;
    }

    if (response.status === 302) {
      const location = response.headers.get('Location');
      if (location) {
        return {
          status: response.status,
          location,
        };
      }
    }

    return response.json();
  }

  getMCPServer(
    workspaceId: string,
    serverId: string,
    organisationId: string = ''
  ) {
    return this.fetch(
      `/mcp-servers/${serverId}?workspace_id=${workspaceId}&organisation_id=${organisationId}`
    );
  }

  getMCPServerClientInfo(workspaceId: string, serverId: string) {
    return this.fetch(
      `/mcp-servers/${serverId}/client-info?workspace_id=${workspaceId}`
    );
  }

  getMCPServerTokens(workspaceId: string, serverId: string) {
    // Picks workspace_id from the access token we send.
    return this.fetch(
      `/mcp-servers/${serverId}/tokens?workspace_id=${workspaceId}`
    );
  }

  saveMCPServerTokens(
    workspaceId: string,
    serverId: string,
    tokens: any,
    accessToken?: string
  ) {
    return this.fetch(
      `/mcp-servers/${serverId}/tokens`,
      'PUT',
      {
        ...(accessToken
          ? { 'x-portkey-api-key': `Bearer ${accessToken}` }
          : {}),
      },
      JSON.stringify({
        ...tokens,
        workspace_id: workspaceId,
      })
    );
  }

  deleteMCPServerTokens(workspaceId: string, serverId: string) {
    return this.fetch(
      `/mcp-servers/${serverId}/tokens?workspace_id=${workspaceId}`,
      'DELETE'
    );
  }

  async introspect(
    token: string,
    token_type_hint: 'access_token' | 'refresh_token' | ''
  ) {
    const result: any = await this.fetch(
      `/oauth/introspect`,
      'POST',
      {},
      JSON.stringify({
        token: token,
        token_type_hint: token_type_hint,
      })
    );

    // TODO: we do this since we use `username` instead of `sub`
    // We should change that in the future
    return {
      active: result.active,
      scope: result.scope || '',
      client_id: result.client_id,
      username: result.sub,
      exp: result.exp,
      iat: result.iat,
      workspace_id: result.workspace_id,
      organisation_id: result.organisation_id,
    };
  }

  async register(clientData: any) {
    return this.fetch(
      `/oauth/register`,
      'POST',
      {},
      JSON.stringify(clientData)
    );
  }

  async authorize(gatewayState: string, resourceId: string) {
    const baseUrl =
      Environment({}).MCP_GATEWAY_BASE_URL || getBaseUrl(this.c).origin;
    return this.fetch(
      `/oauth/${resourceId}/authorize` +
        this.c.req.url.split('/authorize')[1] +
        `&gateway_state=${gatewayState}` +
        `&gateway_base_url=${baseUrl}`,
      'GET',
      {},
      {}
    );
  }

  async revoke(
    token: string,
    token_type_hint?: 'access_token' | 'refresh_token',
    client_id?: string
  ): Promise<void> {
    await this.fetch(
      `/oauth/revoke`,
      'POST',
      {},
      JSON.stringify({
        token: token,
        token_type_hint: token_type_hint,
        client_id: client_id,
      })
    );
  }

  async token(
    params: URLSearchParams,
    headers: Headers,
    oauthStore: CacheService
  ): Promise<any> {
    const response: any = await this.fetch(
      `/oauth/token`,
      'POST',
      headers,
      JSON.stringify(Object.fromEntries(params))
    );
    const authCode = params.get('code');
    if (
      params.get('grant_type') === 'authorization_code' &&
      authCode &&
      response?.access_token
    ) {
      const authCodeCache = await oauthStore.get(authCode, 'auth_codes');
      if (authCodeCache) {
        const { tokens, workspace_id, server_id, client_metadata } =
          authCodeCache;
        await this.saveMCPServerTokens(
          workspace_id,
          server_id,
          { ...tokens, client_metadata },
          response.access_token
        );
        await oauthStore.delete(authCode, 'auth_codes');
      }
    }

    return response;
  }

  get url() {
    return this.controlPlaneUrl;
  }
}

/**
 * Fetches a session from the session store if it exists.
 * If the session is found, it is set in the context.
 */
export const controlPlaneMiddleware = createMiddleware(async (c, next) => {
  if (env(c).ALBUS_BASEPATH) {
    c.set('controlPlane', new ControlPlane(c));
  }

  return next();
});
