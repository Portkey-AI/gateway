/**
 * @file src/handlers/mcpHandler.ts
 * MCP (Model Context Protocol) request handler
 *
 * Performance-optimized handler functions for MCP requests
 *
 * NOTE: Session management removed - sessions are now ephemeral per request.
 * NOTE: SSE downstream support removed - gateway only accepts HTTP Streamable.
 * NOTE: Upstream connections are pooled for low-latency repeat requests.
 */

import { Context } from 'hono';
import { RESPONSE_ALREADY_SENT } from '@hono/node-server/utils/response';

import { ServerConfig } from '../types/mcp';
import { MCPSession, TransportType } from '../services/mcpSession';
import { createLogger } from '../../shared/utils/logger';
import { ControlPlane } from '../middleware/controlPlane';
import { revokeAllClientTokens } from '../utils/oauthTokenRevocation';
import { getConnectionPool } from '../services/upstreamConnectionPool';
import {
  getAllHeadersFromRequest,
  extractHeadersToForward,
} from '../utils/headers';

const logger = createLogger('MCP-Handler');

type Env = {
  Variables: {
    serverConfig: ServerConfig;
    session?: MCPSession;
    tokenInfo?: any; // Token introspection response
    isAuthenticated?: boolean;
    controlPlane?: ControlPlane;
  };
  Bindings: {
    ALBUS_BASEPATH?: string;
  };
};

/**
 * Error response factory
 */
const ErrorResponse = {
  create(code: number, message: string, id: any = null, data?: any) {
    return {
      jsonrpc: '2.0',
      error: { code, message, ...(data && { data }) },
      id,
    };
  },

  serverConfigNotFound: (id?: any) =>
    ErrorResponse.create(-32001, 'Server config not found', id),

  sessionNotFound: (id?: any) =>
    ErrorResponse.create(-32001, 'Session not found', id),

  invalidRequest: (id?: any) =>
    ErrorResponse.create(-32600, 'Invalid Request', id),

  sessionNotInitialized: (id?: any) =>
    ErrorResponse.create(-32000, 'Session not properly initialized', id),

  sessionRestoreFailed: (id?: any) =>
    ErrorResponse.create(
      -32000,
      'Failed to restore session. Please reinitialize.',
      id
    ),

  sessionExpired: (id?: any) =>
    ErrorResponse.create(-32001, 'Session expired', id),

  missingSessionId: (id?: any) =>
    ErrorResponse.create(-32000, 'Session ID required in query parameter', id),

  authorizationRequired(
    id: any,
    error: { workspaceId: string; serverId: string; authorizationUrl: string }
  ) {
    return ErrorResponse.create(
      -32000,
      `Authorization required for ${error.workspaceId}/${error.serverId}. Complete it here: ${error.authorizationUrl}`,
      id,
      { type: 'oauth_required', authorizationUrl: error.authorizationUrl }
    );
  },
};

async function purgeOauthTokens(
  tokenInfo: any,
  controlPlane?: ControlPlane | null
) {
  if (!tokenInfo?.client_id) {
    logger.debug('No client_id in tokenInfo, skipping OAuth token purge');
    return;
  }

  // Use the utility function to revoke all tokens for this client
  await revokeAllClientTokens(tokenInfo, controlPlane);
}

/**
 * Extract token expiration from token info
 * Returns milliseconds since epoch, or undefined if not available
 */
function getTokenExpiresAt(tokenInfo?: any): number | undefined {
  if (!tokenInfo) return undefined;

  // JWT exp claim (seconds since epoch)
  if (tokenInfo.exp) {
    return tokenInfo.exp * 1000;
  }

  // OAuth expires_in (seconds from now)
  if (tokenInfo.expires_in) {
    return Date.now() + tokenInfo.expires_in * 1000;
  }

  // Direct expires_at (milliseconds)
  if (tokenInfo.expires_at) {
    return tokenInfo.expires_at;
  }

  return undefined;
}

/**
 * Create new session with pooled upstream connection
 *
 * Uses the connection pool to get or create an upstream connection,
 * significantly reducing latency for repeat requests to the same server.
 *
 * SECURITY NOTES:
 * - Anonymous users are NOT pooled (prevents state leakage)
 * - Token expiry is checked before reusing connections
 * - Per-server pooling can be disabled via config.disablePooling
 */
async function createSession(
  config: ServerConfig,
  tokenInfo?: any,
  context?: Context<Env>,
  transportType?: TransportType
): Promise<MCPSession> {
  const pool = getConnectionPool();

  // Determine userId for connection pooling based on auth type
  let userId = '';
  if (tokenInfo?.token_type === 'api_key') {
    // API key auth: use API key ID (sub) for per-key connection pooling
    userId = tokenInfo.sub || '';
  } else if (tokenInfo) {
    // OAuth auth: use username from token introspection
    userId = tokenInfo.username || tokenInfo.user_id || '';
  }
  const controlPlane = context?.get('controlPlane');

  // Get token expiration for pool validation
  const tokenExpiresAt = getTokenExpiresAt(tokenInfo);

  // Get incoming headers for forwarding (filtered by allowlist)
  let incomingHeaders: Record<string, string> | undefined;
  if (config.forwardHeaders && context) {
    try {
      const allHeaders = getAllHeadersFromRequest(context.req);
      incomingHeaders = extractHeadersToForward(
        allHeaders,
        config.forwardHeaders
      );
    } catch (error) {
      logger.warn('Failed to get incoming request headers', error);
    }
  }

  // Get pooled upstream connection (with token expiry check)
  const { upstream, reused, poolKey } = await pool.getConnection(
    config,
    userId,
    controlPlane,
    incomingHeaders,
    tokenExpiresAt,
    tokenInfo
  );

  if (reused) {
    logger.debug(`Using pooled connection for ${config.serverId}`);
    // Update dynamic headers on reused connections so fresh headers
    // (trace IDs, refreshed tokens, etc.) are used for this request
    if (incomingHeaders) {
      upstream.updateDynamicHeaders(incomingHeaders);
    }
  } else {
    logger.debug(
      poolKey
        ? `Created new pooled connection for ${config.serverId}`
        : `Created non-pooled connection for ${config.serverId} (anonymous or pooling disabled)`
    );
  }

  // Create session with the upstream connection
  const session = new MCPSession({
    config,
    gatewayToken: tokenInfo,
    context,
    upstream,
    poolKey,
    upstreamSessionId: (upstream.transport as any)?.sessionId,
  });

  if (transportType) {
    try {
      await session.initializeOrRestore(transportType);
      logger.debug(`Session ${session.id} initialized with ${transportType}`);
    } catch (error) {
      const controlPlane = context?.get('controlPlane');
      await purgeOauthTokens(tokenInfo, controlPlane);

      // Mark upstream as unhealthy if connection failed
      session.markUpstreamUnhealthy();

      logger.error(
        `Failed to initialize session (createSession) ${session.id}`,
        error
      );
      throw error;
    }
  }

  // NOTE: Session storage removed - sessions are ephemeral
  // NOTE: Upstream connection stays in pool for reuse (if pooled)
  return session;
}

/**
 * Handle initialization request
 * - If session is undefined, a new MCPSession is created with the server config and gateway token
 * - `session.initializeOrRestore` is then called to initialize or restore the session
 * - If initialize fails, the session is closed and the error is re-thrown
 */
export async function handleClientRequest(
  c: Context<Env>,
  session: MCPSession | undefined
) {
  const { serverConfig, tokenInfo } = c.var;
  const { workspaceId, serverId } = serverConfig;

  try {
    if (!session) {
      logger.debug(`Creating new session for: ${workspaceId}/${serverId}`);
      session = await createSession(serverConfig, tokenInfo, c, 'http');
    }

    await session.initializeOrRestore('http');
    session.handleRequest();
    return RESPONSE_ALREADY_SENT;
  } catch (error: any) {
    const bodyId = ((await c.req.json()) as any)?.id;

    // Clean up session if it was created
    if (session) {
      // NOTE: Using session.close() instead of deleteSession() - sessions are ephemeral
      await session.close();
    }

    // Check if this is an OAuth authorization error
    if (error.authorizationUrl && error.serverId) {
      const controlPlane = c.get('controlPlane');
      await purgeOauthTokens(tokenInfo, controlPlane);
      return c.json(ErrorResponse.authorizationRequired(bodyId, error), 401);
    }

    // Log with session ID if available
    const sessionId = session?.id || 'no-session';
    logger.error(
      `Failed to initialize session (handleClientRequest) ${sessionId}`,
      error
    );
    return c.json(ErrorResponse.sessionRestoreFailed(bodyId), 500);
  }
}

/**
 * Handle GET request for established session
 */
export async function handleEstablishedSessionGET(
  c: Context<Env>,
  session: MCPSession
): Promise<any> {
  // Ensure session is active or can be restored
  try {
    await session.initializeOrRestore();
    logger.debug(`Session ${session.id} ready`);
  } catch (error: any) {
    logger.error(`Failed to prepare session ${session.id}`, error);
    await session.close();
    if (error.needsAuthorization) {
      return c.json(ErrorResponse.authorizationRequired(null, error), 401);
    }
    return c.json(ErrorResponse.sessionRestoreFailed(), 500);
  }

  // NOTE: SSE transport removed - only HTTP Streamable supported
  await session.handleRequest();
  return RESPONSE_ALREADY_SENT;
}

/**
 * Main MCP request handler
 * This is the optimized entry point that delegates to specific handlers
 */
export async function handleMCPRequest(c: Context<Env>) {
  const { serverConfig } = c.var;
  if (!serverConfig) return c.json(ErrorResponse.serverConfigNotFound(), 500);

  let session: MCPSession | undefined = c.var.session;
  let method = c.req.method;

  // Handle GET requests for established sessions
  if (method === 'GET' && session) {
    return handleEstablishedSessionGET(c, session);
  }

  return handleClientRequest(c, session);
}

// NOTE: handleSSERequest and handleSSEMessages removed - SSE downstream not supported
