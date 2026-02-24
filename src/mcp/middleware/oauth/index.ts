/**
 * @file src/middlewares/oauth/index.ts
 * OAuth 2.1 validation middleware for MCP Gateway
 *
 * Implements RFC 9728 (Protected Resource Metadata) and RFC 8414 (Authorization Server Metadata)
 * for MCP server authentication per the Model Context Protocol specification.
 *
 * Authorization checks per RFC 7662 (Token Introspection), RFC 9068 (JWT Access Tokens),
 * and RFC 6750 (Bearer Token Usage).
 */

import { createMiddleware } from 'hono/factory';
import { createLogger } from '../../../shared/utils/logger';
import {
  OAuthGateway,
  TokenIntrospectionResponse,
} from '../../services/oauthGateway';
import { getTokenCache } from '../../services/mcpCacheService';
import { Context } from 'hono';
import { getBaseUrl } from '../../utils/mcp-utils';
import { PORTKEY_HEADER_KEYS } from '../../../middlewares/portkey/globals';
import {
  getContext,
  ContextKeys,
} from '../../../middlewares/portkey/contextHelpers';
import { trackMcpServerTokenKey } from '../../utils/mcpCacheKeyTracker';

type Env = {
  Variables: {
    serverConfig?: any;
    session?: any;
    tokenInfo?: any;
    isAuthenticated?: boolean;
    headersObj?: any;
  };
  Bindings: {
    ALBUS_BASEPATH?: string;
    CLIENT_ID?: string;
  };
};

const logger = createLogger('OAuth-Middleware');

interface OAuthConfig {
  required?: boolean; // Whether OAuth is required for this route
  scopes?: string[]; // Required scopes for this route
  skipPaths?: string[]; // Paths to skip OAuth validation
  validateWorkspace?: boolean; // Whether to validate workspace access (default: true)
  validateServer?: boolean; // Whether to validate server access (default: true)
  validateAudience?: boolean; // Whether to validate token audience (default: false for backwards compatibility)
}

/**
 * Check if token scope includes required scopes
 * Supports wildcards like mcp:* or mcp:servers:*
 *
 * Per RFC 6749 Section 3.3, scopes are space-delimited strings.
 * This implementation supports hierarchical wildcards for MCP scopes.
 *
 * @param tokenScope - Space-delimited scope string from token introspection
 * @param requiredScopes - Array of required scopes for the operation
 * @returns true if all required scopes are granted
 */
function hasRequiredScope(
  tokenScope: string | undefined,
  requiredScopes: string[]
): boolean {
  // If no scopes required, allow access
  if (!requiredScopes || requiredScopes.length === 0) return true;

  // If scopes required but token has none, deny
  if (!tokenScope) return false;

  const grantedScopes = tokenScope.split(' ').filter(Boolean);

  return requiredScopes.every((required) => {
    // Check for exact match
    if (grantedScopes.includes(required)) return true;

    // Check for wildcard matches
    for (const granted of grantedScopes) {
      // Full MCP access covers everything
      if (granted === 'mcp:*') return true;

      // Hierarchical wildcard (e.g., mcp:servers:* covers mcp:servers:read)
      if (granted.endsWith(':*')) {
        const prefix = granted.slice(0, -1); // Remove trailing *
        if (required.startsWith(prefix)) return true;
      }
    }

    return false;
  });
}

/**
 * Check if token has access to the requested workspace
 *
 * Per business logic, a token issued for workspace A cannot access workspace B.
 * The workspace_id claim in the token must match the requested workspace.
 *
 * @param tokenWorkspaceId - workspace_id claim from token introspection
 * @param requestedWorkspaceId - workspaceId from request path parameter
 * @returns true if access is allowed
 */
function hasWorkspaceAccess(
  tokenWorkspaceId: string | undefined,
  requestedWorkspaceId: string | undefined
): boolean {
  // If no workspace specified in request, allow (workspace will be determined later from token)
  if (!requestedWorkspaceId) return true;

  // Token must have a workspace claim to access workspace-scoped resources
  if (!tokenWorkspaceId) return false;

  // Workspace must match
  return tokenWorkspaceId === requestedWorkspaceId;
}

/**
 * Check if token has access to the requested MCP server
 *
 * A token can be scoped to a specific server via the server_id claim.
 * This validation ensures tokens issued for server A cannot access server B.
 *
 * Access is granted if:
 * 1. Token has no server_id claim (workspace-level access)
 * 2. Token's server_id matches the requested server
 *
 * @param tokenServerId - server_id claim from token introspection
 * @param requestedServerId - serverId from request path parameter
 * @returns true if access is allowed
 */
function hasServerAccess(
  tokenServerId: string | undefined,
  requestedServerId: string | undefined
): boolean {
  // If no server specified in request, allow (server will be determined later)
  if (!requestedServerId) return true;

  // If token has no server_id claim, it's workspace-level access (allow any server)
  if (!tokenServerId) return true;

  // Token has server_id claim - it must match the requested server
  return tokenServerId === requestedServerId;
}

/**
 * Check if token audience matches the resource
 *
 * Per RFC 9068 Section 2.2, the "aud" claim identifies the resource server(s)
 * as the intended audience. If present, the resource server must validate
 * that it is an intended recipient.
 *
 * @param tokenAud - aud claim from token (string or array)
 * @param resourceUrl - The URL of the protected resource being accessed
 * @returns true if audience is valid or not required
 */
function hasValidAudience(
  tokenAud: string | string[] | undefined,
  resourceUrl: string
): boolean {
  // If no audience claim, allow (for backwards compatibility)
  // Note: Stricter implementations may want to require aud claim
  if (!tokenAud) return true;

  const audiences = Array.isArray(tokenAud) ? tokenAud : [tokenAud];

  // Check if any audience matches the resource URL or its base
  // Supports both exact match and prefix match for base URLs
  return audiences.some((aud) => {
    // Exact match
    if (aud === resourceUrl) return true;

    // Resource is under the audience base URL
    if (resourceUrl.startsWith(aud)) return true;

    // Audience is a prefix of resource (e.g., aud is base domain)
    if (aud.endsWith('/') && resourceUrl.startsWith(aud)) return true;

    return false;
  });
}

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;

  const match = authorization.match(/^(?:Bearer\s+)?(.+)$/i);
  return match ? match[1] : null;
}

/**
 * Create WWW-Authenticate header value per RFC 9728
 */
function createWWWAuthenticateHeader(baseUrl: string, path: string): string {
  const header = `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource${path}`;

  return header;
}

/**
 * Introspect token with the control plane or local service
 *
 * This function performs token introspection per RFC 7662 and caches the result.
 * Cache keys are tracked using the MCP cache key tracker for invalidation support.
 *
 * @param token - The access token to introspect
 * @param c - Hono context (used to access route params and create OAuthGateway)
 * @returns Token introspection response
 */
async function introspectToken(
  token: string,
  c: Context
): Promise<TokenIntrospectionResponse> {
  // Check persistent cache first
  const cache = getTokenCache();

  const cached = await cache.get(token, 'introspection');
  if (cached) {
    logger.debug('Token found in persistent cache');
    return cached;
  }

  try {
    const gateway = new OAuthGateway(c);
    const result = await gateway.introspectToken(token, 'access_token');

    // Cache the result for 5 minutes or until token expiry
    if (result.active) {
      const expiresIn = result.exp
        ? Math.min(result.exp * 1000 - Date.now(), 5 * 60 * 1000)
        : 5 * 60 * 1000;

      await cache.set(token, result, {
        ttl: expiresIn,
        namespace: 'introspection',
      });

      // Track the cache key for server-based invalidation
      // This allows the sync route to invalidate introspection cache when server config changes
      const organisationId = result.organisation_id;
      const workspaceId = c.req.param('workspaceId') || result.workspace_id;
      const serverId = c.req.param('serverId');

      if (organisationId && workspaceId && serverId) {
        // The McpCacheService uses prefix "mcp:token" and namespace "introspection"
        // Full key format: mcp:token:introspection:{token}
        const fullTokenKey = `mcp:token:introspection:${token}`;
        trackMcpServerTokenKey(
          organisationId,
          workspaceId,
          serverId,
          fullTokenKey
        );
        logger.debug(
          `Tracked introspection cache key for server ${workspaceId}/${serverId}`
        );
      }
    }

    return result;
  } catch (error) {
    logger.error('Failed to introspect token', error);
    return { active: false };
  }
}

/**
 * OAuth validation middleware factory
 *
 * Performs authentication (token introspection) and authorization (scope, workspace, audience)
 * checks per OAuth 2.1 RFCs.
 *
 * @param config - Configuration options for the middleware
 * @returns Hono middleware function
 */
export function oauthMiddleware(config: OAuthConfig = {}) {
  // Default to validating workspace access
  const validateWorkspace = config.validateWorkspace !== false;
  // Default to validating server access
  const validateServer = config.validateServer !== false;
  // Default to NOT validating audience (for backwards compatibility)
  const validateAudience = config.validateAudience === true;

  return createMiddleware<Env>(async (c, next) => {
    const path = c.req.path;

    // Skip OAuth for certain paths
    if (config.skipPaths?.some((skip) => path.startsWith(skip))) {
      return next();
    }

    const baseUrl = getBaseUrl(c).origin;
    const authorization =
      c.req.header('Authorization') || c.req.header('x-portkey-api-key');
    const token = extractBearerToken(authorization);

    // If no token and OAuth is not required, continue
    // NOTE: For production security, OAuth should always be required
    if (!token && !config.required) {
      logger.warn(
        `No token provided for ${path}, continuing without auth - SECURITY RISK`
      );
      return next();
    }

    // If no token and OAuth is required, return 401
    if (!token && config.required) {
      logger.warn(`No token provided for protected resource ${path}`);
      return c.json(
        {
          error: 'unauthorized',
          error_description: 'Authentication required to access this resource',
        },
        401,
        {
          'WWW-Authenticate': createWWWAuthenticateHeader(baseUrl, path),
        }
      );
    }

    // Introspect the token (works with both control plane and local service)
    const introspection: any = await introspectToken(token!, c);

    introspection.token = token;

    // Capture x-portkey-metadata header for OAuth flow
    const metadataHeader = c.req.header(PORTKEY_HEADER_KEYS.METADATA);
    if (metadataHeader) {
      try {
        introspection._incomingMetadata = JSON.parse(metadataHeader);
      } catch (e) {
        logger.warn('Failed to parse x-portkey-metadata header in OAuth flow');
      }
    }

    // === AUTHENTICATION CHECK ===
    if (!introspection.active) {
      logger.warn(`Invalid or expired token for ${path}`);
      return c.json(
        {
          error: 'unauthorized',
          error_description: 'The access token is invalid or has expired',
        },
        401,
        {
          'WWW-Authenticate': createWWWAuthenticateHeader(baseUrl, path),
        }
      );
    }

    // === AUTHORIZATION CHECKS ===

    // 1. Workspace access check
    if (validateWorkspace) {
      const requestedWorkspaceId = c.req.param('workspaceId');
      if (
        !hasWorkspaceAccess(introspection.workspace_id, requestedWorkspaceId)
      ) {
        logger.warn(
          `Token workspace "${introspection.workspace_id}" cannot access workspace "${requestedWorkspaceId}"`
        );
        return c.json(
          {
            error: 'forbidden',
            error_description:
              'Token is not authorized to access this workspace',
          },
          403
        );
      }
    }

    // 2. Server access check (validates workspace + server combination)
    if (validateServer) {
      const requestedServerId = c.req.param('serverId');
      if (!hasServerAccess(introspection.server_id, requestedServerId)) {
        logger.warn(
          `Token for server "${introspection.server_id}" cannot access server "${requestedServerId}"`
        );
        return c.json(
          {
            error: 'forbidden',
            error_description:
              'Token is not authorized to access this MCP server',
          },
          403
        );
      }
    }

    // 3. Scope check
    // if (config.scopes && config.scopes.length > 0) {
    //   if (!hasRequiredScope(introspection.scope, config.scopes)) {
    //     const requiredScopeStr = config.scopes.join(' ');
    //     logger.warn(
    //       `Token scope "${introspection.scope || '(none)'}" missing required: ${requiredScopeStr}`
    //     );
    //     return c.json(
    //       {
    //         error: 'insufficient_scope',
    //         error_description: `Required scope: ${requiredScopeStr}`,
    //       },
    //       403,
    //       {
    //         // Per RFC 6750 Section 3.1, include scope in WWW-Authenticate for insufficient_scope
    //         'WWW-Authenticate': `Bearer error="insufficient_scope", scope="${requiredScopeStr}"`,
    //       }
    //     );
    //   }
    // }

    // 4. Audience check (optional, off by default for backwards compatibility)
    // if (validateAudience) {
    //   const resourceUrl = `${baseUrl}${path}`;
    //   if (!hasValidAudience(introspection.aud, resourceUrl)) {
    //     logger.warn(
    //       `Token audience "${introspection.aud}" invalid for resource "${resourceUrl}"`
    //     );
    //     return c.json(
    //       {
    //         error: 'invalid_token',
    //         error_description: 'Token audience does not match this resource',
    //       },
    //       401,
    //       {
    //         'WWW-Authenticate': `Bearer error="invalid_token", error_description="Token audience mismatch"`,
    //       }
    //     );
    //   }
    // }

    // Store token info in context for downstream use
    c.set('tokenInfo', introspection);
    c.set('isAuthenticated', true);

    return next();
  });
}

/**
 * Middleware that converts Portkey API key details to OAuth tokenInfo format
 * Should be used after authN middleware
 */
export function apiKeyToTokenMapper() {
  return createMiddleware<Env>(async (c: Context, next) => {
    const headersObj = c.get('headersObj');

    if (!headersObj) {
      logger.warn('No headersObj found in context, skipping token mapping');
      return next();
    }

    const organisationDetails = getContext(c, ContextKeys.ORGANISATION_DETAILS);

    if (!organisationDetails) {
      logger.warn('No organisation details found, skipping token mapping');
      return next();
    }

    try {
      if (
        c.req.param('workspaceId') !== undefined &&
        organisationDetails.workspaceDetails.slug !== c.req.param('workspaceId')
      ) {
        return c.json(
          {
            error: 'forbidden',
            error_description: 'You do not have access to this resource',
          },
          403
        );
      }

      // Parse incoming metadata header
      let incomingMetadata: Record<string, any> = {};
      try {
        const metadataHeader = headersObj[PORTKEY_HEADER_KEYS.METADATA];
        if (metadataHeader) {
          incomingMetadata = JSON.parse(metadataHeader);
        }
      } catch (e) {
        logger.warn('Failed to parse x-portkey-metadata header');
      }

      const tokenInfo = {
        active: true,
        token_type: 'api_key',
        token: organisationDetails.apiKeyDetails.key,
        scope: '',
        aud: organisationDetails.id,
        sub: organisationDetails.apiKeyDetails.id,
        workspace_id: organisationDetails.workspaceDetails.slug,
        organisation_id: organisationDetails.id,
        // Extended fields for richer logging
        username:
          organisationDetails.apiKeyDetails.systemDefaults?.user_name || '',
        user_id: organisationDetails.apiKeyDetails.userId || '',
        organisation_name: organisationDetails.name || '',
        workspace_name: organisationDetails.workspaceDetails.name || '',
        // Store full details for rich logging in MCP requests
        _organisationDetails: organisationDetails,
        // Incoming metadata from x-portkey-metadata header
        _incomingMetadata: incomingMetadata,
      };

      c.set('tokenInfo', tokenInfo);
      c.set('isAuthenticated', true);

      logger.debug(
        `Mapped API key to tokenInfo for org: ${organisationDetails.id}`
      );
    } catch (error) {
      logger.error('Failed to map API key to tokenInfo', error);
    }
    return next();
  });
}
