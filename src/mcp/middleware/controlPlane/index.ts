import { Context } from 'hono';
import { env } from 'hono/adapter';
import { createMiddleware } from 'hono/factory';
import { createLogger } from '../../../shared/utils/logger';

import crypto from 'crypto';
import { auth, AuthResult } from '@modelcontextprotocol/sdk/client/auth.js';
import { GatewayOAuthProvider } from '../../services/upstreamOAuth';
import { ServerConfig } from '../../types/mcp';
import { McpCacheService } from '../../services/mcpCacheService';
import {
  createOAuthMetadataFetch,
  createExternalAuthMetadataFetch,
  getBaseUrl,
} from '../../utils/mcp-utils';
import { getServerConfig } from '../hydrateContext';
import { Environment } from '../../../utils/env';
import { internalServiceFetch } from '../../../utils/fetch';

const logger = createLogger('mcp/controlPlaneMiddleware');
const isPrivateDeployment = Environment({}).PRIVATE_DEPLOYMENT === 'ON';

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

    const response = isPrivateDeployment
      ? await internalServiceFetch(reqURL, options)
      : await fetch(reqURL, options);

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

  /**
   * Sync capabilities discovered from upstream MCP server to control plane
   * Called in the background when gateway receives tools/list, prompts/list, resources/list
   * Only syncs new capabilities - doesn't remove existing ones
   *
   * Supports MCP 2025-11-25 spec fields including:
   * - Common: title, icons, annotations, meta
   * - Tools: input_schema, output_schema, execution, tool_annotations
   * - Prompts: arguments
   * - Resources: uri, mime_type, size
   */
  async syncMCPServerCapabilities(
    serverId: string,
    workspaceId: string,
    capabilities: Array<{
      name: string;
      type: 'tool' | 'prompt' | 'resource';
      // Common fields
      title?: string;
      description?: string;
      icons?: Array<{
        src: string;
        mimeType?: string;
        sizes?: string[];
        theme?: 'light' | 'dark';
      }>;
      annotations?: object;
      meta?: object;
      // Tool-specific
      input_schema?: object;
      output_schema?: object;
      execution?: object;
      tool_annotations?: object;
      // Prompt-specific
      arguments?: object[];
      // Resource-specific
      uri?: string;
      mime_type?: string;
      size?: number;
    }>
  ): Promise<boolean> {
    try {
      const result = await this.fetch(
        `/mcp-servers/${serverId}/capabilities/sync?workspace_id=${workspaceId}`,
        'POST',
        {},
        JSON.stringify({ capabilities })
      );
      return result !== null;
    } catch (error) {
      logger.debug('Failed to sync MCP server capabilities', error);
      return false;
    }
  }

  /**
   * Sync server metadata from upstream MCP server to control plane
   * Called after successful connection to capture serverInfo and instructions
   *
   * @param serverId - MCP server ID
   * @param workspaceId - Workspace ID
   * @param metadata - Server metadata from InitializeResult
   */
  async syncMCPServerMetadata(
    serverId: string,
    workspaceId: string,
    metadata: {
      // Server info (Implementation interface)
      server_name?: string;
      server_version?: string;
      protocol_version?: string;
      title?: string;
      description?: string;
      website_url?: string;
      icons?: Array<{
        src: string;
        mimeType?: string;
        sizes?: string[];
        theme?: 'light' | 'dark';
      }>;
      // Server capabilities
      capability_flags?: object;
      // LLM instructions from InitializeResult
      instructions?: string;
    }
  ): Promise<boolean> {
    try {
      const result = await this.fetch(
        `/mcp-servers/${serverId}/metadata/sync?workspace_id=${workspaceId}`,
        'POST',
        {},
        JSON.stringify(metadata)
      );
      return result !== null;
    } catch (error) {
      logger.debug('Failed to sync MCP server metadata', error);
      return false;
    }
  }

  /**
   * Get disabled capabilities for an MCP server
   * Fetches all capabilities and filters for disabled ones
   * Returns list of capabilities that are disabled at integration or server level
   */
  async getMCPServerDisabledCapabilities(
    serverId: string,
    workspaceId: string
  ): Promise<Array<{ name: string; type: string }> | null> {
    try {
      // Fetch all capabilities - the endpoint returns enabled status for each
      const result: any = await this.fetch(
        `/mcp-servers/${serverId}/capabilities?workspace_id=${workspaceId}`
      );
      if (result === null) {
        return null;
      }

      // Filter for disabled capabilities (enabled: false)
      const disabledCapabilities = (result.data ?? [])
        .filter((cap: { enabled: boolean }) => !cap.enabled)
        .map((cap: { name: string; type: string }) => ({
          name: cap.name,
          type: cap.type,
        }));

      return disabledCapabilities;
    } catch (error) {
      logger.error('Failed to get MCP server disabled capabilities', error);
      return null;
    }
  }

  /**
   * Check if a user has access to an MCP server
   *
   * This endpoint validates user-level access control for MCP servers.
   * It requires the user context (OAuth token or API key) to be present.
   *
   * @param workspaceId - The workspace ID
   * @param serverId - The MCP server ID or slug
   * @returns Object with allowed: boolean, user_id, mcp_server_id
   */
  async checkMcpServerUserAccess(
    workspaceId: string,
    serverId: string
  ): Promise<{
    allowed: boolean;
    user_id?: string;
    mcp_server_id?: string;
  } | null> {
    try {
      const result = await this.fetch(
        `/mcp-servers/${serverId}/user-access/check?workspace_id=${workspaceId}`,
        'GET'
      );
      if (result && typeof result === 'object' && 'allowed' in result) {
        return result as {
          allowed: boolean;
          user_id?: string;
          mcp_server_id?: string;
        };
      }
      return null;
    } catch (error) {
      logger.error('Failed to check MCP server user access', error);
      return null;
    }
  }

  /**
   * Introspect token with the control plane
   *
   * Per RFC 7662 (Token Introspection), returns token metadata including claims
   * like aud (audience), scope, workspace_id, etc. for authorization validation.
   *
   * @param token - The token to introspect
   * @param token_type_hint - Hint about the token type
   */
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
      // Audience claim for resource binding validation (per RFC 9068)
      // Can be string or array of strings representing intended recipients
      aud: result.aud || result.audience,
      // Server ID if the token is scoped to a specific MCP server
      server_id: result.resource_id,
      // Extended workspace metadata (when available from control plane)
      organisation_name: result.organisation_name,
      workspace_name: result.workspace_name,
      workspace_slug: result.workspace_slug,
      // Full organisation details for rich logging (when returned by control plane)
      _organisationDetails: result.organisation_details,
      email: result.email,
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

  async authorize(c: Context, oauthStore: McpCacheService) {
    const gatewayState = crypto.randomBytes(16).toString('hex');
    const resourceId = c.req.param('resourceId');
    const workspaceId = c.req.param('workspaceId');
    const redirectUri = c.req.query('redirect_uri');
    const state = c.req.query('state');
    const clientId = c.req.query('client_id');

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

    const baseUrl =
      Environment({}).MCP_GATEWAY_BASE_URL || getBaseUrl(c).origin;

    // Use scoped authorize route if originating from scoped gateway route
    const oauthPath = workspaceId
      ? `/oauth/${workspaceId}/${resourceId}/authorize`
      : `/oauth/${resourceId}/authorize`;

    return this.fetch(
      oauthPath +
        c.req.url.split('/authorize')[1] +
        `&gateway_state=${gatewayState}` +
        `&gateway_base_url=${baseUrl}`,
      'GET',
      {},
      {}
    );
  }

  async postAuthorize(c: Context, oauthStore: McpCacheService) {
    const {
      gateway_state: gatewayState,
      resource_id: serverId,
      workspace_id,
      code,
      state,
      upstream_auth_needed,
      external_auth_needed,
      organisation_id,
      user_id,
    } = c.req.query();
    if (!gatewayState) {
      return this.c.json({ error: 'invalid_request' }, 400);
    }

    const resumeData = await oauthStore.get(gatewayState, 'gateway_state');
    if (!resumeData) {
      return this.c.json({ error: 'invalid_request' }, 400);
    }

    // Invalidate gateway state as early as possible for security
    await oauthStore.delete(gatewayState, 'gateway_state');

    if (resumeData.state && resumeData.state !== state) {
      return this.c.json({ error: 'invalid_request' }, 400);
    }
    if (resumeData.server_id !== serverId) {
      return this.c.json({ error: 'invalid_request' }, 400);
    }

    // Handle external auth - control plane signals that auth should be handled externally
    if (external_auth_needed) {
      const serverConfig: ServerConfig = await getServerConfig(
        workspace_id,
        serverId,
        c,
        organisation_id
      );

      if (!serverConfig.external_auth_config) {
        logger.error('External auth needed but no external_auth_config found');
        return this.c.json(
          {
            error: 'invalid_configuration',
            error_description: 'External auth config missing',
          },
          500
        );
      }

      const provider = new GatewayOAuthProvider(
        serverConfig,
        user_id,
        undefined, // Don't use control plane for external auth
        '',
        gatewayState,
        true, // isExternalAuth
        getBaseUrl(c).origin
      );

      // Control plane is source of truth - invalidate cached tokens to force fresh authorization
      await provider.invalidateCredentials('tokens');

      try {
        // Create fetch function that uses external auth metadata
        const fetchFn = createExternalAuthMetadataFetch(
          serverConfig.external_auth_config
        );
        const result: AuthResult = await auth(provider, {
          serverUrl: new URL(serverConfig.url),
          fetchFn,
        });

        logger.debug('External auth result', result);
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
              is_external_auth: true,
            },
            { namespace: 'gateway_state', ttl: 10 * 60 * 1000 }
          );

          return {
            status: 'auth_needed',
            authorizationUrl: error.authorizationUrl,
            is_external_auth: true,
          };
        }
        throw error;
      }
    }

    if (upstream_auth_needed) {
      const serverConfig: ServerConfig = await getServerConfig(
        workspace_id,
        serverId,
        c,
        organisation_id
      );
      const provider = new GatewayOAuthProvider(
        serverConfig,
        user_id,
        c.get('controlPlane') ?? undefined,
        '',
        gatewayState,
        false, // isExternalAuth
        getBaseUrl(c).origin
      );

      // Control plane is source of truth - invalidate cached tokens to force fresh authorization
      await provider.invalidateCredentials('tokens');

      try {
        const fetchFn = createOAuthMetadataFetch(serverConfig);
        const result: AuthResult = await auth(provider, {
          serverUrl: new URL(serverConfig.url),
          ...(fetchFn && { fetchFn }),
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
    oauthStore: McpCacheService
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
