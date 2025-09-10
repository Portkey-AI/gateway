/**
 * @file src/services/upstreamOAuth.ts
 * OAuth provider for upstream MCP server connections
 */

import { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import {
  OAuthTokens,
  OAuthClientInformationFull,
  OAuthClientMetadata,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { ServerConfig } from '../../types/mcp';
import { createLogger } from '../../utils/logger';
import { CacheService, getMcpServersCache } from '../cache';
import { ControlPlane } from '../../middlewares/controlPlane';

const logger = createLogger('UpstreamOAuth');

export class GatewayOAuthProvider implements OAuthClientProvider {
  private _clientInfo?: OAuthClientInformationFull;
  private mcpServersCache: CacheService;
  constructor(
    private config: ServerConfig,
    private userId: string,
    private controlPlane?: ControlPlane
  ) {
    this.mcpServersCache = getMcpServersCache();
  }

  get redirectUrl(): string {
    // Use our upstream callback handler
    const baseUrl =
      process.env.BASE_URL || `http://localhost:${process.env.PORT || 8788}`;
    return `${baseUrl}/oauth/upstream-callback`;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'Portkey MCP Gateway',
      redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      client_uri: 'https://portkey.ai',
      logo_uri: 'https://cfassets.portkey.ai/logo%2Fdew-color.png',
      software_version: '0.5.1',
      software_id: 'portkey-mcp-gateway',
    };
  }

  async clientInformation(): Promise<OAuthClientInformationFull | undefined> {
    // First check if we have it in memory
    if (this._clientInfo) {
      logger.debug(`Returning in-memory client info for ${this.config.url}`, {
        client_id: this._clientInfo.client_id,
      });
      return this._clientInfo;
    }

    // Try to get from persistent storage
    if (
      this.userId.length > 0 &&
      this.config.serverId &&
      this.config.workspaceId
    ) {
      const cacheKey = `${this.userId}::${this.config.workspaceId}::${this.config.serverId}`;
      const clientInfo = await this.mcpServersCache.get(
        cacheKey,
        'client_info'
      );
      if (clientInfo) {
        this._clientInfo = clientInfo;
        return clientInfo;
      }
    }

    // For oauth_auto, we don't have pre-registered client info
    // The SDK will handle dynamic client registration
    logger.debug(`No pre-registered client info for ${this.config.url}`);
    return undefined;
  }

  async saveClientInformation(
    clientInfo: OAuthClientInformationFull
  ): Promise<void> {
    // Store the client info for later use
    this._clientInfo = clientInfo;
    logger.debug(
      `Saving client info for ${this.config.workspaceId}/${this.config.serverId}`,
      clientInfo
    );
    const cacheKey = `${this.userId}::${this.config.workspaceId}::${this.config.serverId}`;
    await this.mcpServersCache.set(cacheKey, clientInfo, {
      namespace: 'client_info',
    });
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const cacheKey = `${this.userId}::${this.config.workspaceId}::${this.config.serverId}`;
    const tokens =
      (await this.mcpServersCache.get<OAuthTokens>(cacheKey, 'tokens')) ??
      undefined;

    if (!tokens && this.controlPlane) {
      const cpTokens = await this.controlPlane.getMCPServerTokens(
        this.config.workspaceId,
        this.config.serverId
      );
      if (cpTokens) {
        await this.mcpServersCache.set(cacheKey, cpTokens, {
          namespace: 'tokens',
        });
        return cpTokens as OAuthTokens;
      }
    }
    return tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    logger.debug(
      `Saving tokens for ${this.config.workspaceId}/${this.config.serverId}`
    );

    if (tokens && this.controlPlane) {
      // Save tokens to control plane for persistence
      await this.controlPlane.saveMCPServerTokens(
        this.config.workspaceId,
        this.config.serverId,
        tokens
      );
    }

    const cacheKey = `${this.userId}::${this.config.workspaceId}::${this.config.serverId}`;
    await this.mcpServersCache.set(cacheKey, tokens, { namespace: 'tokens' });
  }

  async redirectToAuthorization(url: URL): Promise<void> {
    const state = `${this.userId}::${this.config.workspaceId}::${this.config.serverId}`;
    url.searchParams.set('state', state);
    logger.info(
      `Authorization redirect requested for ${this.config.workspaceId}/${this.config.serverId}: ${url}`
    );

    // Throw a specific error that mcpSession can catch
    const error = new Error(
      `Authorization required for ${this.config.workspaceId}/${this.config.serverId}`
    );
    (error as any).needsAuthorization = true;
    (error as any).authorizationUrl = url.toString();
    (error as any).serverId = this.config.workspaceId;
    (error as any).workspaceId = this.config.workspaceId;
    throw error;
  }

  async saveCodeVerifier(verifier: string): Promise<void> {
    // For server-to-server, PKCE might not be needed, but we'll support it
    logger.debug(
      `Saving code verifier for ${this.config.workspaceId}/${this.config.serverId}`
    );
    const cacheKey = `${this.userId}::${this.config.workspaceId}::${this.config.serverId}`;
    await this.mcpServersCache.set(cacheKey, verifier, {
      namespace: 'code_verifier',
    });
  }

  async codeVerifier(): Promise<string> {
    const cacheKey = `${this.userId}::${this.config.workspaceId}::${this.config.serverId}`;
    const codeVerifier = await this.mcpServersCache.get(
      cacheKey,
      'code_verifier'
    );
    return codeVerifier || '';
  }

  async invalidateCredentials(
    scope: 'all' | 'client' | 'tokens' | 'verifier'
  ): Promise<void> {
    logger.debug(`Invalidating ${scope} credentials for ${this.config.url}`);
    const cacheKey = `${this.userId}::${this.config.workspaceId}::${this.config.serverId}`;

    switch (scope) {
      case 'all':
        await this.mcpServersCache.delete(cacheKey, 'tokens');
        await this.mcpServersCache.delete(cacheKey, 'code_verifier');
        break;
      case 'tokens':
        await this.mcpServersCache.delete(cacheKey, 'tokens');
        break;
      case 'verifier':
        delete (this as any)._codeVerifier;
        break;
      // 'client' scope would need persistent storage to handle properly
    }
  }
}
