/**
 * @file src/services/localOAuth.ts
 * Local OAuth implementation for standalone gateway operation
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createLogger } from '../utils/logger';
import crypto from 'crypto';

const logger = createLogger('LocalOAuth');

interface OAuthClient {
  client_secret: string;
  name: string;
  allowed_scopes: string[];
  allowed_servers: string[];
  redirect_uris?: string[];
  grant_types?: string[];
  server_permissions: Record<
    string,
    {
      allowed_tools?: string[] | null;
      blocked_tools?: string[];
      rate_limit?: {
        requests: number;
        window: number;
      } | null;
    }
  >;
}

interface StoredToken {
  client_id: string;
  active: boolean;
  scope: string;
  exp?: number;
  iat?: number;
  mcp_permissions: {
    servers: Record<
      string,
      {
        allowed_tools?: string[] | null;
        blocked_tools?: string[];
        rate_limit?: {
          requests: number;
          window: number;
        } | null;
      }
    >;
  };
}

interface AuthorizationCode {
  client_id: string;
  redirect_uri: string;
  scope: string;
  code_challenge?: string;
  code_challenge_method?: string;
  expires: number;
}

interface OAuthConfig {
  clients: Record<string, OAuthClient>;
  tokens: Record<string, StoredToken>;
  authorization_codes: Record<string, AuthorizationCode>;
}

export class LocalOAuthService {
  private config: OAuthConfig = {
    clients: {},
    tokens: {},
    authorization_codes: {},
  };
  private configPath: string;
  constructor(configPath?: string) {
    this.configPath =
      configPath || join(process.cwd(), 'src/config/oauth-config.json');
    this.loadConfig();
  }

  private loadConfig() {
    try {
      if (existsSync(this.configPath)) {
        const data = readFileSync(this.configPath, 'utf-8');
        this.config = JSON.parse(data);

        // Ensure all required properties exist
        if (!this.config.clients) this.config.clients = {};
        if (!this.config.tokens) this.config.tokens = {};
        if (!this.config.authorization_codes)
          this.config.authorization_codes = {};

        logger.info(
          `Loaded OAuth config with ${Object.keys(this.config.clients).length} clients`
        );
      } else {
        // Create default config
        this.config = {
          clients: {},
          tokens: {},
          authorization_codes: {},
        };
        this.saveConfig();
        logger.warn('Created new OAuth config file');
      }
    } catch (error) {
      logger.error('Failed to load OAuth config', error);
      this.config = { clients: {}, tokens: {}, authorization_codes: {} };
    }
  }

  private saveConfig() {
    try {
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
      logger.info(`OAuth config saved successfully to ${this.configPath}`);
      logger.debug(
        `Config now has ${Object.keys(this.config.clients).length} clients`
      );
    } catch (error) {
      logger.error('Failed to save OAuth config', error);
      logger.error(`Config path: ${this.configPath}`);
      logger.error(`Error details:`, error);
    }
  }

  /**
   * Generate authorization URL for browser flow
   */
  generateAuthorizationUrl(params: {
    client_id: string;
    redirect_uri: string;
    state?: string;
    scope?: string;
    code_challenge?: string;
    code_challenge_method?: string;
  }): { url: string; error?: string } {
    const client = this.config.clients[params.client_id];
    if (!client) {
      return { url: '', error: 'Invalid client_id' };
    }

    // Validate redirect_uri
    if (
      client.redirect_uris &&
      !client.redirect_uris.includes(params.redirect_uri)
    ) {
      return { url: '', error: 'Invalid redirect_uri' };
    }

    // For local OAuth, we'll return a simple HTML page
    const baseUrl = process.env.GATEWAY_URL || 'http://localhost:8788';
    const authUrl = new URL(`${baseUrl}/oauth/authorize`);

    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', params.client_id);
    authUrl.searchParams.set('redirect_uri', params.redirect_uri);
    if (params.state) authUrl.searchParams.set('state', params.state);
    if (params.scope) authUrl.searchParams.set('scope', params.scope);
    if (params.code_challenge) {
      authUrl.searchParams.set('code_challenge', params.code_challenge);
      authUrl.searchParams.set(
        'code_challenge_method',
        params.code_challenge_method || 'S256'
      );
    }

    return { url: authUrl.toString() };
  }

  /**
   * Create authorization code
   */
  createAuthorizationCode(params: {
    client_id: string;
    redirect_uri: string;
    scope: string;
    code_challenge?: string;
    code_challenge_method?: string;
  }): string {
    const code = `authz_${crypto.randomBytes(32).toString('hex')}`;

    this.config.authorization_codes[code] = {
      client_id: params.client_id,
      redirect_uri: params.redirect_uri,
      scope: params.scope,
      code_challenge: params.code_challenge,
      code_challenge_method: params.code_challenge_method,
      expires: Date.now() + 10 * 60 * 1000, // 10 minutes
    };

    this.saveConfig();
    return code;
  }

  /**
   * Verify PKCE code verifier
   */
  private verifyCodeChallenge(
    verifier: string,
    challenge: string,
    method: string = 'S256'
  ): boolean {
    if (method === 'S256') {
      const hash = crypto
        .createHash('sha256')
        .update(verifier)
        .digest('base64url');
      return hash === challenge;
    }
    return verifier === challenge; // plain method
  }

  /**
   * Handle token request (supports both client_credentials and authorization_code)
   */
  async handleTokenRequest(params: URLSearchParams): Promise<any> {
    const grantType = params.get('grant_type');
    const clientId = params.get('client_id');
    const clientSecret = params.get('client_secret');

    logger.info('Token request:', {
      grant_type: grantType,
      client_id: clientId,
      scope: params.get('scope'),
      redirect_uri: params.get('redirect_uri'),
    });

    if (grantType === 'authorization_code') {
      // Handle authorization code flow
      const code = params.get('code');
      const redirectUri = params.get('redirect_uri');
      const codeVerifier = params.get('code_verifier');

      if (!code || !redirectUri) {
        return {
          error: 'invalid_request',
          error_description:
            'Missing required parameters: code and redirect_uri are required',
        };
      }

      const authCode = this.config.authorization_codes[code];
      if (!authCode || authCode.expires < Date.now()) {
        delete this.config.authorization_codes[code];
        this.saveConfig();
        return {
          error: 'invalid_grant',
          error_description: 'Invalid or expired authorization code',
        };
      }

      // For public clients, client_id might be missing in the request
      // We can get it from the authorization code
      const effectiveClientId = clientId || authCode.client_id;

      // Validate client
      const client = this.config.clients[effectiveClientId];
      if (!client) {
        logger.error(`Client not found: ${effectiveClientId}`);
        return {
          error: 'invalid_client',
          error_description: 'Client not found',
        };
      }

      // Ensure the authorization code was issued to this client
      if (authCode.client_id !== effectiveClientId) {
        return {
          error: 'invalid_grant',
          error_description:
            'Authorization code was issued to a different client',
        };
      }

      // For confidential clients, validate client_secret
      // For public clients (empty client_secret), skip secret validation but require PKCE
      if (
        client.client_secret &&
        client.client_secret !== (clientSecret || '')
      ) {
        return {
          error: 'invalid_client',
          error_description: 'Invalid client credentials',
        };
      }

      // Public clients MUST use PKCE
      if (!client.client_secret && !authCode.code_challenge) {
        return {
          error: 'invalid_request',
          error_description: 'PKCE required for public clients',
        };
      }

      // Validate redirect_uri
      if (authCode.redirect_uri !== redirectUri) {
        return {
          error: 'invalid_grant',
          error_description: 'Redirect URI mismatch',
        };
      }

      // Validate PKCE if used
      if (authCode.code_challenge) {
        if (!codeVerifier) {
          return {
            error: 'invalid_request',
            error_description: 'Code verifier required',
          };
        }

        if (
          !this.verifyCodeChallenge(
            codeVerifier,
            authCode.code_challenge,
            authCode.code_challenge_method || 'S256'
          )
        ) {
          return {
            error: 'invalid_grant',
            error_description: 'Invalid code verifier',
          };
        }
      }

      // Clean up used code
      delete this.config.authorization_codes[code];

      // Generate token
      const token = `mcp_${crypto.randomBytes(32).toString('hex')}`;
      const now = Math.floor(Date.now() / 1000);
      const expiresIn = 3600;

      // Use the scope from the authorization code, or default to allowed scopes
      const tokenScope = authCode.scope || client.allowed_scopes.join(' ');

      logger.info('Issuing token for authorization code:', {
        client_id: effectiveClientId,
        scope: tokenScope,
        original_scope: authCode.scope,
      });

      this.config.tokens[token] = {
        client_id: effectiveClientId,
        active: true,
        scope: tokenScope,
        iat: now,
        exp: now + expiresIn,
        mcp_permissions: {
          servers: client.server_permissions,
        },
      };

      this.saveConfig();

      return {
        access_token: token,
        token_type: 'Bearer',
        expires_in: expiresIn,
        scope: tokenScope,
      };
    }

    if (grantType === 'client_credentials') {
      const scope = params.get('scope') || 'mcp:*';

      if (!clientId) {
        return {
          error: 'invalid_client',
          error_description: 'Client ID required',
        };
      }

      const client = this.config.clients[clientId];
      if (!client) {
        return {
          error: 'invalid_client',
          error_description: 'Client not found',
        };
      }

      // For confidential clients, validate client_secret
      if (
        client.client_secret &&
        client.client_secret !== (clientSecret || '')
      ) {
        return {
          error: 'invalid_client',
          error_description: 'Invalid client credentials',
        };
      }

      // Public clients shouldn't use client_credentials grant
      if (!client.client_secret) {
        return {
          error: 'unauthorized_client',
          error_description:
            'Public clients must use authorization_code grant with PKCE',
        };
      }

      // Check if requested scope is allowed
      const requestedScopes = scope.split(' ');
      const allowedScopes = client.allowed_scopes;

      const validScopes = requestedScopes.filter(
        (s) => allowedScopes.includes('mcp:*') || allowedScopes.includes(s)
      );

      if (validScopes.length === 0) {
        return {
          error: 'invalid_scope',
          error_description: 'Requested scope not allowed for this client',
        };
      }

      // Generate access token
      const token = `mcp_${crypto.randomBytes(32).toString('hex')}`;
      const now = Math.floor(Date.now() / 1000);
      const expiresIn = 3600; // 1 hour
      const finalScope = validScopes.join(' ');

      logger.info('Issuing token:', {
        client_id: clientId,
        scope: finalScope,
        requested_scopes: requestedScopes,
        allowed_scopes: allowedScopes,
        server_permissions: client.server_permissions,
      });

      // Store token
      this.config.tokens[token] = {
        client_id: clientId,
        active: true,
        scope: finalScope,
        iat: now,
        exp: now + expiresIn,
        mcp_permissions: {
          servers: client.server_permissions,
        },
      };

      this.saveConfig();

      return {
        access_token: token,
        token_type: 'Bearer',
        expires_in: expiresIn,
        scope: finalScope,
      };
    }

    return {
      error: 'unsupported_grant_type',
      error_description:
        'Only client_credentials and authorization_code grant types are supported',
    };
  }

  /**
   * Handle token introspection
   */
  async introspectToken(token: string): Promise<any> {
    const tokenData = this.config.tokens[token];

    if (!tokenData) {
      logger.debug('Token not found in store');
      return { active: false };
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (tokenData.exp && tokenData.exp < now) {
      logger.debug('Token is expired');
      tokenData.active = false;
      this.saveConfig();
      return { active: false };
    }

    const client = this.config.clients[tokenData.client_id];

    const response = {
      active: tokenData.active,
      scope: tokenData.scope,
      client_id: tokenData.client_id,
      username: client?.name,
      exp: tokenData.exp,
      iat: tokenData.iat,
      mcp_permissions: tokenData.mcp_permissions,
    };

    logger.info('Token introspection response:', {
      client_id: response.client_id,
      scope: response.scope,
      active: response.active,
      mcp_permissions: response.mcp_permissions,
    });

    return response;
  }

  /**
   * Revoke a token
   */
  async revokeToken(token: string): Promise<void> {
    if (this.config.tokens[token]) {
      this.config.tokens[token].active = false;
      this.saveConfig();
    }
  }

  /**
   * Get default server permissions
   */
  private async getDefaultServerPermissions(): Promise<{
    availableServers: string[];
    serverPermissions: Record<string, any>;
  }> {
    // Load available servers from servers.json
    let availableServers = ['linear', 'deepwiki']; // Default servers
    try {
      const serverConfigPath =
        process.env.SERVERS_CONFIG_PATH || './src/config/servers.json';
      const { readFileSync } = await import('fs');
      const { resolve } = await import('path');
      const configPath = resolve(serverConfigPath);
      const configData = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configData);
      if (config.servers) {
        availableServers = Object.keys(config.servers);
      }
    } catch (error) {
      logger.warn('Could not load server list, using defaults', error);
    }

    // Create server permissions for all available servers
    const serverPermissions: Record<string, any> = {};
    for (const server of availableServers) {
      serverPermissions[server] = {
        allowed_tools: null, // null means all tools allowed
        blocked_tools:
          server === 'linear' ? ['deleteProject', 'deleteIssue'] : [],
        rate_limit: server === 'linear' ? { requests: 100, window: 60 } : null,
      };
    }

    return { availableServers, serverPermissions };
  }

  /**
   * Register a new client or update existing one
   */
  async registerClient(
    clientData: {
      client_name: string;
      scope?: string;
      redirect_uris?: string[];
      grant_types?: string[];
      token_endpoint_auth_method?: string;
    },
    clientId?: string
  ): Promise<any> {
    // Generate ID if not provided
    const id =
      clientId || `mcp_client_${crypto.randomBytes(16).toString('hex')}`;

    // Check if client already exists
    if (clientId && this.config.clients[id]) {
      logger.info(
        `Client ${id} already exists, updating redirect URIs if needed`
      );

      // For existing clients, just update redirect URIs if provided
      if (clientData.redirect_uris) {
        const client = this.config.clients[id];
        if (!client.redirect_uris) {
          client.redirect_uris = [];
        }

        for (const uri of clientData.redirect_uris) {
          if (!client.redirect_uris.includes(uri)) {
            client.redirect_uris.push(uri);
          }
        }
        this.saveConfig();
      }

      return {
        client_id: id,
        client_name: this.config.clients[id].name,
        scope: this.config.clients[id].allowed_scopes.join(' '),
        redirect_uris: this.config.clients[id].redirect_uris,
        grant_types: this.config.clients[id].grant_types,
        token_endpoint_auth_method: this.config.clients[id].client_secret
          ? 'client_secret_post'
          : 'none',
      };
    }

    const grantTypes = clientData.grant_types || ['client_credentials'];
    const isPublicClient =
      clientData.token_endpoint_auth_method === 'none' ||
      (grantTypes.includes('authorization_code') &&
        !grantTypes.includes('client_credentials'));

    // Validate redirect URIs for authorization code flow
    if (
      grantTypes.includes('authorization_code') &&
      (!clientData.redirect_uris || clientData.redirect_uris.length === 0)
    ) {
      return {
        error: 'invalid_client_metadata',
        error_description:
          'redirect_uris required for authorization_code grant',
      };
    }

    // Get default permissions
    const { availableServers, serverPermissions } =
      await this.getDefaultServerPermissions();

    // Create client
    const clientSecret = isPublicClient
      ? ''
      : `mcp_secret_${crypto.randomBytes(32).toString('hex')}`;

    this.config.clients[id] = {
      client_secret: clientSecret,
      name: clientData.client_name,
      allowed_scopes: clientData.scope?.split(' ') || ['mcp:*'],
      allowed_servers: availableServers,
      redirect_uris: clientData.redirect_uris,
      grant_types: grantTypes,
      server_permissions: serverPermissions,
    };

    this.saveConfig();

    logger.info(
      `Registered ${isPublicClient ? 'public' : 'confidential'} client ${id}`
    );

    const response: any = {
      client_id: id,
      client_name: clientData.client_name,
      scope: this.config.clients[id].allowed_scopes.join(' '),
      redirect_uris: clientData.redirect_uris,
      grant_types: grantTypes,
      token_endpoint_auth_method: isPublicClient
        ? 'none'
        : 'client_secret_post',
    };

    if (!isPublicClient) {
      response.client_secret = clientSecret;
    }

    return response;
  }

  /**
   * Get client information
   */
  async getClient(clientId: string): Promise<OAuthClient | null> {
    return this.config.clients[clientId] || null;
  }

  /**
   * Clean up expired tokens and authorization codes
   */
  cleanupExpiredTokens() {
    const now = Math.floor(Date.now() / 1000);
    const nowMs = Date.now();
    let cleanedTokens = 0;
    let cleanedCodes = 0;

    // Clean expired tokens
    for (const [token, data] of Object.entries(this.config.tokens)) {
      if (data.exp && data.exp < now) {
        delete this.config.tokens[token];
        cleanedTokens++;
      }
    }

    // Clean expired authorization codes
    if (this.config.authorization_codes) {
      for (const [code, data] of Object.entries(
        this.config.authorization_codes
      )) {
        if (data.expires < nowMs) {
          delete this.config.authorization_codes[code];
          cleanedCodes++;
        }
      }
    }

    if (cleanedTokens > 0 || cleanedCodes > 0) {
      this.saveConfig();
      logger.info(
        `Cleaned up ${cleanedTokens} expired tokens and ${cleanedCodes} expired auth codes`
      );
    }
  }
}

// Singleton instance
export const localOAuth = new LocalOAuthService();
