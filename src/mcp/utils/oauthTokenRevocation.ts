/**
 * @file src/utils/oauthTokenRevocation.ts
 * Utility functions for OAuth token revocation
 */

import { getOauthStore } from '../../shared/services/cache';
import { createLogger } from '../../shared/utils/logger';
import { ControlPlane } from '../middleware/controlPlane';

const logger = createLogger('OAuth-Token-Revocation');

interface StoredAccessToken {
  client_id: string;
  [key: string]: any;
}

interface StoredRefreshToken {
  client_id: string;
  access_tokens?: string[];
  [key: string]: any;
}

/**
 * Revoke an OAuth token (access or refresh)
 * @param token The token to revoke
 * @param clientId The client ID that owns the token
 * @param tokenTypeHint Optional hint about token type ('access_token' or 'refresh_token')
 * @returns true if token was revoked, false if not found or not owned by client
 */
export async function revokeOAuthToken(
  token: string,
  clientId: string,
  tokenTypeHint?: 'access_token' | 'refresh_token'
): Promise<boolean> {
  const oauthStore = getOauthStore();

  const tryRevokeAccess = async (): Promise<boolean> => {
    const tokenData = await oauthStore.get<StoredAccessToken>(token, 'tokens');
    if (tokenData && tokenData.client_id === clientId) {
      await oauthStore.delete(token, 'tokens');
      logger.debug(`Revoked access token for client_id ${clientId}`);
      return true;
    }
    return false;
  };

  const tryRevokeRefresh = async (): Promise<boolean> => {
    const refresh = await oauthStore.get<StoredRefreshToken>(
      token,
      'refresh_tokens'
    );
    if (refresh && refresh.client_id === clientId) {
      // Revoke all associated access tokens
      for (const at of refresh.access_tokens || []) {
        await oauthStore.delete(at, 'tokens');
      }
      // Revoke the refresh token itself
      await oauthStore.delete(token, 'refresh_tokens');
      logger.debug(
        `Revoked refresh token and associated access tokens for client_id ${clientId}`
      );
      return true;
    }
    return false;
  };

  // Try based on hint, or try both
  if (tokenTypeHint === 'access_token') {
    return await tryRevokeAccess();
  } else if (tokenTypeHint === 'refresh_token') {
    return await tryRevokeRefresh();
  } else {
    // Try both, return true if either succeeds
    return (await tryRevokeAccess()) || (await tryRevokeRefresh());
  }
}

/**
 * Revoke all OAuth tokens for a given client ID
 * This finds the refresh token associated with the client and revokes it along with all access tokens
 * @param clientId The client ID whose tokens should be revoked
 * @param controlPlane Optional ControlPlane instance to use for revocation
 */
export async function revokeAllClientTokens(
  tokenInfo: any,
  controlPlane?: ControlPlane | null
): Promise<void> {
  logger.debug(
    `Revoking all OAuth tokens for client_id ${tokenInfo.client_id}`
  );
  const oauthStore = getOauthStore();

  let refreshToken: string | null = null;

  if (tokenInfo.refresh_token) {
    refreshToken = tokenInfo.refresh_token;
    // Try control plane first if available
    if (controlPlane) {
      try {
        await controlPlane.revoke(
          refreshToken!,
          'refresh_token',
          tokenInfo.client_id
        );
        logger.debug(
          `Revoked tokens via control plane for client_id ${tokenInfo.client_id}`
        );
      } catch (error) {
        logger.warn(
          'Control plane revocation failed, will continue with local',
          error
        );
      }
    }
  } else {
    // Get the refresh token for this client_id
    refreshToken = await oauthStore.get(
      tokenInfo.client_id,
      'clientid_refresh'
    );
  }

  logger.debug(
    `Refresh token for client_id ${tokenInfo.client_id} is ${refreshToken}`
  );

  // Always revoke locally (for cache cleanup)
  await revokeOAuthToken(
    tokenInfo.refresh_token,
    tokenInfo.client_id,
    'refresh_token'
  );

  await revokeOAuthToken(tokenInfo.token, tokenInfo.client_id, 'access_token');

  // Clean up the clientid_refresh mapping
  await oauthStore.delete(tokenInfo.client_id, 'clientid_refresh');
}
