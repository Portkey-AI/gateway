/**
 * @file src/services/oauthGateway.ts
 * Unified OAuth gateway service that handles both control plane and local OAuth operations
 */

import { createLogger } from '../utils/logger';
import { localOAuth } from './localOAuth';

const logger = createLogger('OAuthGateway');

export interface TokenRequest {
  grant_type: string;
  client_id?: string;
  client_secret?: string;
  code?: string;
  redirect_uri?: string;
  code_verifier?: string;
  scope?: string;
}

export interface TokenIntrospectionResponse {
  active: boolean;
  scope?: string;
  client_id?: string;
  username?: string;
  exp?: number;
  iat?: number;
  mcp_permissions?: {
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

export interface ClientRegistration {
  client_name: string;
  scope?: string;
  redirect_uris?: string[];
  grant_types?: string[];
  token_endpoint_auth_method?: string;
}

/**
 * Unified OAuth gateway that routes requests to either control plane or local service
 */
export class OAuthGateway {
  private controlPlaneUrl: string | null;
  private userAgent = 'Portkey-MCP-Gateway/0.1.0';

  constructor(controlPlaneUrl?: string | null) {
    this.controlPlaneUrl =
      controlPlaneUrl || process.env.ALBUS_BASEPATH || null;
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
  async handleTokenRequest(params: URLSearchParams): Promise<any> {
    if (!this.isUsingControlPlane) {
      logger.debug('Using local OAuth service for token request');
      return await localOAuth.handleTokenRequest(params);
    }

    logger.debug('Proxying token request to control plane');
    const response = await fetch(`${this.controlPlaneUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': this.userAgent,
      },
      body: params.toString(),
    });

    return await response.json();
  }

  /**
   * Introspect token
   */
  async introspectToken(
    token: string,
    authHeader?: string
  ): Promise<TokenIntrospectionResponse> {
    if (!this.isUsingControlPlane) {
      logger.debug('Using local OAuth service for token introspection');
      return await localOAuth.introspectToken(token);
    }

    logger.debug('Proxying introspection request to control plane');
    const response = await fetch(`${this.controlPlaneUrl}/oauth/introspect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': this.userAgent,
        ...(authHeader && { Authorization: authHeader }),
      },
      body: new URLSearchParams({ token }).toString(),
    });

    if (!response.ok) {
      logger.error(`Token introspection failed: ${response.status}`);
      return { active: false };
    }

    return await response.json();
  }

  /**
   * Register client
   */
  async registerClient(clientData: ClientRegistration): Promise<any> {
    if (!this.isUsingControlPlane) {
      logger.debug('Using local OAuth service for client registration');
      return await localOAuth.registerClient(clientData);
    }

    logger.debug('Proxying registration request to control plane');
    const response = await fetch(`${this.controlPlaneUrl}/oauth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': this.userAgent,
      },
      body: JSON.stringify(clientData),
    });

    return await response.json();
  }

  /**
   * Revoke token
   */
  async revokeToken(token: string, authHeader?: string): Promise<void> {
    if (!this.isUsingControlPlane) {
      logger.debug('Using local OAuth service for revocation');
      await localOAuth.revokeToken(token);
      return;
    }

    logger.debug('Proxying revocation request to control plane');
    await fetch(`${this.controlPlaneUrl}/oauth/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': this.userAgent,
        ...(authHeader && { Authorization: authHeader }),
      },
      body: new URLSearchParams({ token }).toString(),
    });
  }

  /**
   * Get authorization URL for browser flow (local only)
   */
  generateAuthorizationUrl(params: {
    client_id: string;
    redirect_uri: string;
    state?: string;
    scope?: string;
    code_challenge?: string;
    code_challenge_method?: string;
  }): string | null {
    if (this.isUsingControlPlane) {
      // For control plane, just construct the URL
      const query = new URLSearchParams({
        response_type: 'code',
        ...params,
      });
      return `${this.controlPlaneUrl}/oauth/authorize?${query}`;
    }

    // For local, we need to know the gateway URL
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

    return authUrl.toString();
  }
}

// Create a singleton instance for convenience
export const oauthGateway = new OAuthGateway();
