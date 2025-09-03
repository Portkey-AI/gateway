import { Context } from 'hono';
import { env } from 'hono/adapter';
import { createMiddleware } from 'hono/factory';
import { createLogger } from '../../utils/logger';

const logger = createLogger('mcp/controlPlaneMiddleware');

class ControlPlane {
  private controlPlaneUrl: string;
  private defaultHeaders: Record<string, string>;

  constructor(private c: Context) {
    this.controlPlaneUrl = env(c).ALBUS_BASEPATH;

    this.defaultHeaders = {
      'User-Agent': 'Portkey-MCP-Gateway/0.1.0',
      'Content-Type': 'application/json',
      'x-client-id-gateway': env(c).CLIENT_ID,
    };
  }

  async fetch(
    path: string,
    method: string = 'GET',
    headers: any = {},
    body: any = {}
  ) {
    const reqURL = `${this.controlPlaneUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: {
        ...this.defaultHeaders,
        ...headers,
      },
    };

    if (method === 'POST') {
      options.body = body;
    }

    const response = await fetch(reqURL, options);
    return response.json();
  }

  getMCPServer(workspaceId: string, serverId: string) {
    return this.fetch(`/v2/mcp-servers/${workspaceId}/${serverId}`);
  }

  getMCPServerTokens(workspaceId: string, serverId: string) {
    return this.fetch(`/v2/mcp-servers/${workspaceId}/${serverId}/tokens`);
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
