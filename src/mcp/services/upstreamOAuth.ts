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
import { ServerConfig } from '../types/mcp';
import { createLogger } from '../../shared/utils/logger';
import { CacheService, getMcpServersCache } from '../../shared/services/cache';
import { ControlPlane } from '../middleware/controlPlane';
import crypto from 'crypto';
import { Environment } from '../../utils/env';

const logger = createLogger('UpstreamOAuth');

export class GatewayOAuthProvider implements OAuthClientProvider {
  private _clientInfo?: OAuthClientInformationFull;
  private cache: CacheService;
  private workspaceId: string;
  private serverId: string;
  private stateKey: string;
  private resumeStateKey: string;

  constructor(
    config: ServerConfig,
    private userId: string,
    private controlPlane?: ControlPlane,
    stateKey?: string,
    resumeStateKey?: string
  ) {
    this.cache = getMcpServersCache();
    this.workspaceId = config.workspaceId;
    this.serverId = config.serverId;
    if (stateKey) {
      this.stateKey = stateKey;
    } else {
      this.stateKey = crypto.randomBytes(32).toString('hex');
    }
    this.resumeStateKey = resumeStateKey || '';
  }

  state(): string {
    return this.stateKey;
  }

  get redirectUrl(): string {
    // Use our upstream callback handler
    const baseUrl =
      Environment({}).MCP_GATEWAY_BASE_URL ||
      `http://localhost:${Environment({}).MCP_PORT}`;
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
    // Try to get from state cache first
    const stateCache = await this.cache.get(this.stateKey, 'upstream_state');
    if (stateCache?.client_metadata) {
      return stateCache.client_metadata;
    }

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

      return clientInfo;
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
    logger.debug(
      `Saving client info for ${this.workspaceId}/${this.serverId}`,
      clientInfo
    );

    await this.cache.set(
      this.stateKey,
      {
        client_metadata: clientInfo,
        resume_state_key: this.resumeStateKey,
      },
      {
        namespace: 'upstream_state',
        ttl: 10 * 60 * 1000, // 10 minutes
      }
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
    logger.debug(
      `Saving upstream tokens for ${this.workspaceId}/${this.serverId}`
    );

    // Get the state cache to find the auth_code
    const stateCache = await this.cache.get(this.stateKey, 'upstream_state');

    if (stateCache?.auth_code) {
      // Store tokens temporarily against the client's auth_code
      // They will be persisted when the client exchanges the auth_code
      stateCache.upstream_tokens = tokens;

      await this.cache.set(this.stateKey, stateCache, {
        namespace: 'upstream_state',
        ttl: 10 * 60 * 1000,
      });

      // Also store directly by auth_code for easy retrieval during token exchange
      await this.cache.set(
        `upstream_tokens:${stateCache.auth_code}`,
        {
          tokens,
          workspace_id: this.workspaceId,
          server_id: this.serverId,
          user_id: this.userId,
        },
        { ttl: 10 * 60 * 1000 }
      );

      logger.info('Upstream tokens stored temporarily against auth_code', {
        auth_code: stateCache.auth_code,
      });
    } else {
      logger.warn('No auth_code in state cache, saving tokens directly');
      if (tokens && this.controlPlane) {
        // Save tokens to control plane for persistence
        await this.controlPlane.saveMCPServerTokens(
          this.workspaceId,
          this.serverId,
          tokens
        );
      }
      // Fallback: save directly (for non-delegated flows)
      await this.cache.set(this.cacheKey, tokens, {
        namespace: 'tokens',
      });
    }
  }

  async redirectToAuthorization(url: URL): Promise<void> {
    // Set state in URL
    url.searchParams.set('state', this.stateKey);

    // Store code challenge/method from the URL in state cache
    const codeChallenge = url.searchParams.get('code_challenge');
    const codeChallengeMethod = url.searchParams.get('code_challenge_method');

    const stateCache = await this.cache.get(this.stateKey, 'upstream_state');

    if (!stateCache) {
      throw new Error('State cache not found');
    }

    if (codeChallenge) stateCache.code_challenge = codeChallenge;
    if (codeChallengeMethod)
      stateCache.code_challenge_method = codeChallengeMethod;

    await this.cache.set(this.stateKey, stateCache, {
      namespace: 'upstream_state',
      ttl: 10 * 60 * 1000, // 10 minutes
    });

    logger.info(
      `Authorization redirect for ${this.workspaceId}/${this.serverId}`,
      { url: url.toString(), state: this.stateKey }
    );

    const error = new Error(
      `Authorization required for ${this.workspaceId}/${this.serverId}`
    );
    (error as any).needsAuthorization = true;
    (error as any).authorizationUrl = url.toString();
    (error as any).serverId = this.serverId;
    (error as any).workspaceId = this.workspaceId;
    throw error;
  }

  async saveCodeVerifier(verifier: string): Promise<void> {
    logger.debug(
      `Saving code verifier for ${this.workspaceId}/${this.serverId}`
    );

    const stateCache = await this.cache.get(this.stateKey, 'upstream_state');
    if (stateCache) {
      stateCache.code_verifier = verifier;
      await this.cache.set(this.stateKey, stateCache, {
        namespace: 'upstream_state',
        ttl: 10 * 60 * 1000,
      });
    }
  }

  async codeVerifier(): Promise<string> {
    const stateCache = await this.cache.get(this.stateKey, 'upstream_state');
    if (!stateCache) {
      throw new Error('State cache not found');
    }
    return stateCache.code_verifier;
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
