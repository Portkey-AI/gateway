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
  private cache: CacheService;
  private workspaceId: string;
  private serverId: string;

  constructor(
    config: ServerConfig,
    private userId: string,
    private controlPlane?: ControlPlane
  ) {
    this.cache = getMcpServersCache();
    this.workspaceId = config.workspaceId;
    this.serverId = config.serverId;
  }

  get redirectUrl(): string {
    // Use our upstream callback handler
    const baseUrl =
      process.env.BASE_URL || `http://localhost:${process.env.PORT || 8788}`;
    return `${baseUrl}/oauth/upstream-callback`;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: `Portkey (${this.workspaceId}/${this.serverId})`,
      redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      client_uri: 'https://portkey.ai',
      logo_uri: 'https://cfassets.portkey.ai/logo%2Fdew-color.png',
      software_id: 'ai.portkey.mcp',
    };
  }

  private get cacheKey(): string {
    return `${this.userId}::${this.workspaceId}::${this.serverId}`;
  }

  async clientInformation(): Promise<OAuthClientInformationFull | undefined> {
    // First check if we have it in memory
    if (this._clientInfo) return this._clientInfo;

    // Try to get from persistent storage
    if (this.userId.length > 0 && this.serverId && this.workspaceId) {
      let clientInfo = await this.cache.get(this.cacheKey, 'client_info');

      if (!clientInfo && this.controlPlane) {
        clientInfo = await this.controlPlane.getMCPServerClientInfo(
          this.workspaceId,
          this.serverId
        );

        if (clientInfo) {
          await this.cache.set(this.cacheKey, clientInfo, {
            namespace: 'client_info',
          });
        }
      }

      if (clientInfo) {
        this._clientInfo = clientInfo;
        return clientInfo;
      }
    }

    // For oauth_auto, we don't have pre-registered client info
    // The SDK will handle dynamic client registration
    logger.debug(
      `No pre-registered client info for ${this.workspaceId}/${this.serverId}`
    );
    return undefined;
  }

  async saveClientInformation(
    clientInfo: OAuthClientInformationFull
  ): Promise<void> {
    // Store the client info for later use
    this._clientInfo = clientInfo;
    logger.debug(
      `Saving client info for ${this.workspaceId}/${this.serverId}`,
      clientInfo
    );
    await this.cache.set(this.cacheKey, clientInfo, {
      namespace: 'client_info',
    });
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const tokens =
      (await this.cache.get<OAuthTokens>(this.cacheKey, 'tokens')) ?? undefined;

    if (!tokens && this.controlPlane) {
      const cpTokens = await this.controlPlane.getMCPServerTokens(
        this.workspaceId,
        this.serverId
      );
      if (cpTokens) {
        await this.cache.set(this.cacheKey, cpTokens, {
          namespace: 'tokens',
        });
        return cpTokens as OAuthTokens;
      }
    }
    return tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    logger.debug(`Saving tokens for ${this.workspaceId}/${this.serverId}`);

    if (tokens && this.controlPlane) {
      // Save tokens to control plane for persistence
      await this.controlPlane.saveMCPServerTokens(
        this.workspaceId,
        this.serverId,
        tokens
      );
    }

    await this.cache.set(this.cacheKey, tokens, { namespace: 'tokens' });
  }

  async redirectToAuthorization(url: URL): Promise<void> {
    url.searchParams.set('state', this.cacheKey);
    logger.info(
      `Authorization redirect requested for ${this.workspaceId}/${this.serverId}: ${url}`
    );

    // Throw a specific error that mcpSession can catch
    const error = new Error(
      `Authorization required for ${this.workspaceId}/${this.serverId}`
    );
    (error as any).needsAuthorization = true;
    (error as any).authorizationUrl = url.toString();
    (error as any).serverId = this.workspaceId;
    (error as any).workspaceId = this.workspaceId;
    throw error;
  }

  async saveCodeVerifier(verifier: string): Promise<void> {
    // For server-to-server, PKCE might not be needed, but we'll support it
    logger.debug(
      `Saving code verifier for ${this.workspaceId}/${this.serverId}`
    );
    await this.cache.set(this.cacheKey, verifier, {
      namespace: 'code_verifier',
    });
  }

  async codeVerifier(): Promise<string> {
    const codeVerifier = await this.cache.get(this.cacheKey, 'code_verifier');
    return codeVerifier || '';
  }

  async invalidateCredentials(
    scope: 'all' | 'client' | 'tokens' | 'verifier'
  ): Promise<void> {
    logger.debug(
      `Invalidating ${scope} credentials for ${this.workspaceId}/${this.serverId}`
    );

    switch (scope) {
      case 'all':
        if (this.controlPlane) {
          await this.controlPlane.deleteMCPServerTokens(
            this.workspaceId,
            this.serverId
          );
        }
        await this.cache.delete(this.cacheKey, 'tokens');
        await this.cache.delete(this.cacheKey, 'code_verifier');
        break;
      case 'tokens':
        await this.cache.delete(this.cacheKey, 'tokens');
        break;
      case 'verifier':
        delete (this as any)._codeVerifier;
        break;
      // 'client' scope would need persistent storage to handle properly
    }
  }
}
