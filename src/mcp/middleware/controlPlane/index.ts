import { Context } from 'hono';
import { env } from 'hono/adapter';
import { createMiddleware } from 'hono/factory';
import { createLogger } from '../../../shared/utils/logger';

const logger = createLogger('mcp/controlPlaneMiddleware');

export class ControlPlane {
  private controlPlaneUrl: string;
  private defaultHeaders: Record<string, string>;

  constructor(private c: Context) {
    this.controlPlaneUrl = env(c).ALBUS_BASEPATH;

    this.defaultHeaders = {
      'User-Agent': 'Portkey-MCP-Gateway/0.1.0',
      'Content-Type': 'application/json',
      Authorization: `${env(c).PORTKEY_CLIENT_AUTH}`,
    };
  }

  async fetch(
    path: string,
    method: string = 'GET',
    headers: any = {},
    body: any = {}
  ) {
    const reqURL = `${this.controlPlaneUrl}/v2${path}`;
    if (this.c.get('tokenInfo')?.token) {
      headers['x-portkey-api-key'] = `Bearer ${this.c.get('tokenInfo').token}`;
    }
    const options: RequestInit = {
      method,
      headers: {
        ...this.defaultHeaders,
        ...headers,
      },
    };

    if (method === 'POST' || method === 'PUT') {
      options.body = body;
    }

    logger.debug('Making a request to control plane', { reqURL, options });

    const response = await fetch(reqURL, options);
    return response.json();
  }

  getMCPServer(workspaceId: string, serverId: string) {
    return this.fetch(`/mcp-servers/${serverId}?workspace_id=${workspaceId}`);
  }

  getMCPServerClientInfo(workspaceId: string, serverId: string) {
    return this.fetch(`/mcp-servers/${serverId}/client-info`);
  }

  getMCPServerTokens(workspaceId: string, serverId: string) {
    // Picks workspace_id from the access token we send.
    return this.fetch(
      `/mcp-servers/${serverId}/tokens?workspace_id=${workspaceId}`
    );
  }

  saveMCPServerTokens(workspaceId: string, serverId: string, tokens: any) {
    return this.fetch(
      `/mcp-servers/${serverId}/tokens`,
      'PUT',
      {},
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
    };
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
