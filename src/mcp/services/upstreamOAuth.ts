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
import { McpCacheService, getMcpServersCache } from './mcpCacheService';
import { ControlPlane } from '../middleware/controlPlane';
import crypto from 'crypto';
import { Environment } from '../../utils/env';
import { trackMcpServerTokenKey } from '../utils/mcpCacheKeyTracker';

const logger = createLogger('UpstreamOAuth');

// Allowlist of OAuth client metadata fields that can be customized
// Excluded for security: redirect_uris (must be Gateway-controlled)
// Excluded (not yet supported): jwks_uri, jwks, software_statement
const ALLOWED_CUSTOM_METADATA_FIELDS: Array<
  Exclude<
    keyof OAuthClientInformationFull,
    | 'redirect_uris'
    | 'client_id'
    | 'client_secret'
    | 'client_id_issued_at'
    | 'client_secret_expires_at'
  >
> = [
  'client_name',
  'client_uri',
  'logo_uri',
  'scope',
  'software_id',
  'software_version',
  'grant_types',
  'response_types',
  'token_endpoint_auth_method',
  'contacts',
  'tos_uri',
  'policy_uri',
];

export class GatewayOAuthProvider implements OAuthClientProvider {
  private _clientInfo?: OAuthClientInformationFull;
  private cache: McpCacheService;
  private workspaceId: string;
  private serverId: string;
  private organisationId: string;
  private stateKey: string;
  private resumeStateKey: string;
  private customClientMetadata?: Partial<OAuthClientInformationFull>;
  private isExternalAuth: boolean;
  private externalAuthConfig?: ServerConfig['external_auth_config'];
  private incomingBaseUrl?: string;

  constructor(
    config: ServerConfig,
    private userId: string,
    private controlPlane?: ControlPlane,
    stateKey?: string,
    resumeStateKey?: string,
    isExternalAuth: boolean = false,
    incomingBaseUrl?: string
  ) {
    this.cache = getMcpServersCache();
    this.workspaceId = config.workspaceId;
    this.serverId = config.serverId;
    this.organisationId = config.organisationId || '';
    this.customClientMetadata = config.oauth_client_metadata;
    this.isExternalAuth = isExternalAuth;
    this.externalAuthConfig = config.external_auth_config;
    this.incomingBaseUrl = incomingBaseUrl;

    // For external auth, merge external auth config client credentials into custom metadata
    if (isExternalAuth && this.externalAuthConfig) {
      this.customClientMetadata = {
        ...this.customClientMetadata,
        ...(this.externalAuthConfig.client_id && {
          client_id: this.externalAuthConfig.client_id,
        }),
        ...(this.externalAuthConfig.client_secret && {
          client_secret: this.externalAuthConfig.client_secret,
        }),
      };
    }

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
    // Priority: env var > incoming request URL > localhost fallback
    const baseUrl =
      Environment({}).MCP_GATEWAY_BASE_URL ||
      this.incomingBaseUrl ||
      `http://localhost:${Environment({}).MCP_PORT || 8787}`;
    return `${baseUrl}/oauth/upstream-callback`;
  }

  get clientMetadata(): OAuthClientMetadata {
    // Default Portkey metadata
    const defaults: OAuthClientMetadata = {
      client_name: `Portkey (${this.workspaceId}/${this.serverId})`,
      redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      client_uri: 'https://portkey.ai',
      logo_uri: 'https://cfassets.portkey.ai/logo%2Fdew-color.png',
      software_id: 'ai.portkey.mcp',
    };

    // Merge with custom metadata from control plane if provided
    // Only allowed fields can be customized (redirect_uris is excluded for security)
    if (this.customClientMetadata) {
      const safeCustomMetadata: Partial<OAuthClientMetadata> = {};

      for (const field of ALLOWED_CUSTOM_METADATA_FIELDS) {
        if (
          this.customClientMetadata[field] !== undefined &&
          this.customClientMetadata[field] !== null
        ) {
          (safeCustomMetadata as any)[field] = this.customClientMetadata[field];
        }
      }

      return {
        ...defaults,
        ...safeCustomMetadata,
        // Always use Gateway's callback URL - custom redirect URIs are not allowed
        redirect_uris: [this.redirectUrl],
      };
    }

    return defaults;
  }

  private get cacheKey(): string {
    return `${this.userId}::${this.workspaceId}::${this.serverId}`;
  }

  async clientInformation(): Promise<OAuthClientInformationFull | undefined> {
    // Try to get from state cache first
    const stateCache = await this.cache.get(this.stateKey, 'upstream_state');

    if (
      !stateCache?.client_metadata &&
      this.customClientMetadata?.client_id &&
      this.resumeStateKey
    ) {
      await this.cache.set(
        this.stateKey,
        {
          client_metadata: this.clientMetadata,
          resume_state_key: this.resumeStateKey,
          client_id: this.customClientMetadata?.client_id,
          ...(this.customClientMetadata?.client_secret && {
            client_secret: this.customClientMetadata?.client_secret,
          }),
        },
        {
          namespace: 'upstream_state',
          ttl: 10 * 60 * 1000, // 10 minutes
        }
      );
      return {
        ...this.clientMetadata,
        client_id: this.customClientMetadata?.client_id,
        ...(this.customClientMetadata?.client_secret && {
          client_secret: this.customClientMetadata?.client_secret,
        }),
      };
    } else if (stateCache?.client_metadata) {
      return {
        ...stateCache.client_metadata,
        ...(this.customClientMetadata?.client_id && {
          client_id: this.customClientMetadata?.client_id,
        }),
        ...(this.customClientMetadata?.client_secret && {
          client_secret: this.customClientMetadata?.client_secret,
        }),
      };
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
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const tokens =
      (await this.cache.get<OAuthTokens>(this.cacheKey, 'tokens')) ?? undefined;

    // For external auth, only use local cache (no control plane)
    if (this.isExternalAuth) {
      return tokens;
    }

    if (!tokens && this.controlPlane) {
      const cpTokens = await this.controlPlane.getMCPServerTokens(
        this.workspaceId,
        this.serverId
      );
      if (cpTokens) {
        await this.cache.set(this.cacheKey, cpTokens, {
          namespace: 'tokens',
        });

        // Track this token key for invalidation when server config changes
        if (this.organisationId) {
          const fullTokenKey = `tokens:${this.cacheKey}`;
          trackMcpServerTokenKey(
            this.organisationId,
            this.workspaceId,
            this.serverId,
            fullTokenKey
          );
        }

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
      // Fallback: save directly (for non-delegated flows)
      await this.cache.set(this.cacheKey, tokens, {
        namespace: 'tokens',
      });

      // Track this token key for invalidation when server config changes
      if (this.organisationId) {
        const fullTokenKey = `tokens:${this.cacheKey}`;
        trackMcpServerTokenKey(
          this.organisationId,
          this.workspaceId,
          this.serverId,
          fullTokenKey
        );
      }
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
        // For external auth, only delete from local cache
        if (!this.isExternalAuth && this.controlPlane) {
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
