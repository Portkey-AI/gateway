/**
 * @file src/handlers/mcpHandler.ts
 * MCP (Model Context Protocol) request handler
 *
 * Performance-optimized handler functions for MCP requests
 */

import { Context } from 'hono';
import { RESPONSE_ALREADY_SENT } from '@hono/node-server/utils/response';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse';

import { ServerConfig } from '../types/mcp';
import { MCPSession, TransportType } from '../services/mcpSession';
import { getSessionStore } from '../services/sessionStore';
import { createLogger } from '../../shared/utils/logger';
import { ControlPlane } from '../middleware/controlPlane';
import { revokeAllClientTokens } from '../utils/oauthTokenRevocation';

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

/**
 * Detect transport type from request
 */
function detectTransportType(
  c: Context<Env>,
  session?: MCPSession
): TransportType {
  if (session?.getClientTransportType()) {
    return session.getClientTransportType()!;
  }

  const acceptHeader = c.req.header('Accept');
  return c.req.method === 'GET' && acceptHeader?.includes('text/event-stream')
    ? 'sse'
    : 'http';
}

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
 * Create new session
 */
async function createSession(
  config: ServerConfig,
  tokenInfo?: any,
  context?: Context<Env>,
  transportType?: TransportType
): Promise<MCPSession> {
  const session = new MCPSession({
    config,
    gatewayToken: tokenInfo,
    context,
  });

  if (transportType) {
    try {
      await session.initializeOrRestore(transportType);
      logger.debug(`Session ${session.id} initialized with ${transportType}`);
    } catch (error) {
      const controlPlane = context?.get('controlPlane');
      await purgeOauthTokens(tokenInfo, controlPlane);
      logger.error(
        `Failed to initialize session (createSession) ${session.id}`,
        error
      );
      throw error;
    }
  }

  await setSession(session.id, session);
  return session;
}

/**
 * Handle initialization request
 * - If session is undefined, a new MCPSession is created with the server config and gateway token
 * - `session.initializeOrRestore` is then called to initialize or restore the session
 * - If initialize fails, the session is deleted from the store and the error is re-thrown
 */
export async function handleClientRequest(
  c: Context<Env>,
  session: MCPSession | undefined
) {
  const { serverConfig, tokenInfo } = c.var;
  const { workspaceId, serverId } = serverConfig;

  if (!session) {
    logger.debug(`Creating new session for: ${workspaceId}/${serverId}`);
    session = await createSession(serverConfig, tokenInfo, c, 'http');
  }

  try {
    await session.initializeOrRestore('http');
    session.handleRequest();
    return RESPONSE_ALREADY_SENT;
  } catch (error: any) {
    const bodyId = ((await c.req.json()) as any)?.id;
    await deleteSession(session.id);

    // Check if this is an OAuth authorization error
    if (error.authorizationUrl && error.serverId) {
      const controlPlane = c.get('controlPlane');
      await purgeOauthTokens(tokenInfo, controlPlane);
      return c.json(ErrorResponse.authorizationRequired(bodyId, error), 401);
    }

    // Other errors
    logger.error(
      `Failed to initialize session (handleClientRequest) ${session.id}`,
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
    await deleteSession(session.id);
    if (error.needsAuthorization) {
      return c.json(ErrorResponse.authorizationRequired(null, error), 401);
    }
    return c.json(ErrorResponse.sessionRestoreFailed(), 500);
  }

  // Route based on transport type
  if (session.getClientTransportType() === 'sse') {
    const transport = session.initializeSSETransport();
    await setSession(transport.sessionId, session);
    await transport.start();
  } else {
    await session.handleRequest();
  }
  return RESPONSE_ALREADY_SENT;
}

async function setSession(sessionId: string, session: MCPSession) {
  const sessionStore = getSessionStore();
  await sessionStore.set(sessionId, session);
}

async function deleteSession(sessionId: string) {
  const sessionStore = getSessionStore();
  await sessionStore.delete(sessionId);
}

/**
 * Prepare session for request handling
 * Returns true if session is ready, false if failed
 */
export async function prepareSessionForRequest(
  c: Context<Env>,
  session: MCPSession
): Promise<boolean> {
  try {
    const transportType = detectTransportType(c, session);
    await session.initializeOrRestore(transportType);
    logger.debug(`Session ${session.id} ready for request handling`);
    return true;
  } catch (error) {
    logger.error(`Failed to prepare session ${session.id}`, error);
    await deleteSession(session.id);
    return false;
  }
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

export async function handleSSERequest(c: Context<Env>) {
  const { serverConfig } = c.var;
  if (!serverConfig) return c.json(ErrorResponse.serverConfigNotFound(), 500);

  let session: MCPSession | undefined = c.var.session;
  const isSSE = c.req.header('Accept') === 'text/event-stream';

  if (!isSSE) {
    return c.json(ErrorResponse.invalidRequest(), 400);
  }

  if (!session) {
    return c.json(ErrorResponse.sessionNotFound(), 404);
  }

  try {
    await session.handleRequest();
  } catch (error: any) {
    logger.error(`Error handling SSE request for session ${session.id}`, error);
    await deleteSession(session.id);
    return c.json(ErrorResponse.sessionRestoreFailed(), 500);
  }
  return RESPONSE_ALREADY_SENT;
}

/**
 * Handle SSE messages endpoint
 */
export async function handleSSEMessages(c: Context<Env>) {
  const sessionStore = getSessionStore();
  logger.debug(`POST ${c.req.url}`);
  const sessionId = c.req.query('sessionId');

  if (!sessionId) {
    logger.warn('POST /messages: Missing session ID in query');
    return c.json(ErrorResponse.missingSessionId(), 400);
  }

  const session = await sessionStore.get(sessionId);
  if (!session) {
    logger.warn(`POST /messages: Session ${sessionId} not found`);
    return c.json(ErrorResponse.sessionNotFound(), 404);
  }

  // Check if session is expired
  if (session.isTokenExpired()) {
    logger.debug(`SSE session ${sessionId} expired, removing`);
    await deleteSession(sessionId);
    return c.json(ErrorResponse.sessionExpired(), 401);
  }

  // Ensure session is ready for SSE messages
  try {
    const transportType = 'sse';
    await session.initializeOrRestore(transportType);
    logger.debug(`Session ${sessionId} ready for SSE messages`);
  } catch (error) {
    logger.error(
      `Failed to prepare session ${sessionId} for SSE messages`,
      error
    );
    await deleteSession(sessionId);
    return c.json(ErrorResponse.sessionRestoreFailed(), 500);
  }

  const body = await c.req.json();

  logger.debug(`Session ${sessionId}: Processing ${body.method} message`);

  const { incoming: req, outgoing: res } = c.env as any;
  const transport = session.getDownstreamTransport() as SSEServerTransport;
  await transport.handlePostMessage(req, res, body);

  return RESPONSE_ALREADY_SENT;
}
