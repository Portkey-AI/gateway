/**
 * @file src/handlers/mcpHandler.ts
 * MCP (Model Context Protocol) request handler
 *
 * Performance-optimized handler functions for MCP requests
 */

import { Context } from 'hono';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { RESPONSE_ALREADY_SENT } from '@hono/node-server/utils/response';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse';

import { ServerConfig } from '../types/mcp';
import { MCPSession, TransportType } from '../services/mcpSession';
import { getSessionStore } from '../services/sessionStore';
import { createLogger } from '../utils/logger';
import { HEADER_MCP_SESSION_ID, HEADER_SSE_SESSION_ID } from '../constants/mcp';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport';
import { ControlPlane } from '../middlewares/controlPlane';

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
 * Pre-defined error responses to avoid object allocation in hot path
 */
const ErrorResponses = {
  serverConfigNotFound: (id: any = null) => ({
    jsonrpc: '2.0',
    error: {
      code: -32001,
      message: 'Server config not found',
    },
    id,
  }),
  sessionNotFound: (id: any = null) => ({
    jsonrpc: '2.0',
    error: {
      code: -32001,
      message: 'Session not found',
    },
    id,
  }),
  invalidRequest: (id: any = null) => ({
    jsonrpc: '2.0',
    error: {
      code: -32600,
      message: 'Invalid Request',
    },
    id,
  }),

  parseError: (id: any = null) => ({
    jsonrpc: '2.0',
    error: {
      code: -32700,
      message: 'Parse error',
    },
    id,
  }),

  invalidParams: (id: any = null) => ({
    jsonrpc: '2.0',
    error: {
      code: -32602,
      message: 'Invalid params',
    },
    id,
  }),

  sessionNotInitialized: (id: any = null) => ({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Session not properly initialized',
    },
    id,
  }),

  sessionRestoreFailed: (id: any = null) => ({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Failed to restore session. Please reinitialize.',
    },
    id,
  }),
};

/**
 * Handle initialization request
 * - If session is undefined, a new MCPSession is created with the server config and gateway token
 * - `session.initializeOrRestore` is then called to initialize or restore the session
 * - If initialize fails, the session is deleted from the store and the error is re-thrown
 */
export async function handleInitializeRequest(
  c: Context<Env>,
  session: MCPSession | undefined
): Promise<MCPSession | undefined> {
  const serverConfig = c.var.serverConfig;

  if (!session) {
    logger.debug(
      `Creating new session for server: ${serverConfig.workspaceId}/${serverConfig.serverId}`
    );

    session = new MCPSession({
      config: serverConfig,
      gatewayToken: c.var.tokenInfo,
      context: c,
    });

    await setSession(session.id, session);
  }

  // This path is only taken for streamable-http clients
  const clientTransportType: TransportType = 'streamable-http';

  logger.debug(
    `Session ${session.id}: Client requesting ${clientTransportType} transport`
  );

  try {
    await session.initializeOrRestore(clientTransportType);
    return session;
  } catch (error: any) {
    await deleteSession(session.id);

    logger.error(`Failed to initialize session ${session.id}`, error);
    throw error;
  }
}

/**
 * Setup SSE connection for a session
 * Extracted for clarity while maintaining performance
 */
// export function setupSSEConnection(res: any, session: MCPSession): void {
//   res.writeHead(200, {
//     'Content-Type': 'text/event-stream',
//     'Cache-Control': 'no-cache, no-transform',
//     Connection: 'keep-alive',
//     [HEADER_SSE_SESSION_ID]: session.id,
//     [HEADER_MCP_SESSION_ID]: session.id,
//   });

//   // Handle connection cleanup on close/error
//   const cleanupSession = () => {
//     logger.debug(`SSE connection closed for session ${session.id}`);
//     deleteSession(session.id);
//     session.close().catch((err) => logger.error('Error closing session', err));
//   };

//   res.on('close', cleanupSession);
//   res.on('error', (error: any) => {
//     logger.error(`SSE connection error for session ${session.id}`, error);
//     cleanupSession();
//   });
// }

/**
 * Handle GET request for established session
 */
export async function handleEstablishedSessionGET(
  c: Context<Env>,
  session: MCPSession
): Promise<any> {
  let transport: Transport;
  // Ensure session is active or can be restored
  try {
    transport = await session.initializeOrRestore();
    logger.debug(`Session ${session.id} ready`);
  } catch (error: any) {
    logger.error(`Failed to prepare session ${session.id}`, error);
    await deleteSession(session.id);
    if (error.needsAuthorization) {
      return c.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: `Authorization required for ${error.workspaceId}/${error.serverId}. Go to the following URL to complete the OAuth flow: ${error.authorizationUrl}`,
            data: {
              type: 'oauth_required',
              authorizationUrl: error.authorizationUrl,
            },
          },
          id: null,
        },
        401
      );
    }
    return c.json(ErrorResponses.sessionRestoreFailed(), 500);
  }

  const { incoming: req, outgoing: res } = c.env as any;

  // Route based on transport type
  if (session.getClientTransportType() === 'sse') {
    const transport = session.initializeSSETransport(res);
    await setSession(transport.sessionId, session);
    await transport.start();
    return RESPONSE_ALREADY_SENT;
  } else {
    logger.debug(`Session ${session.id} ready for connection`);
    // For Streamable HTTP clients
    logger.debug(`Session ${session.id} needs to handle the request`);
    await session.handleRequest(req, res);
    return RESPONSE_ALREADY_SENT;
  }
}

/**
 * Create SSE session for pure SSE clients
 */
export async function createSSESession(
  serverConfig: ServerConfig,
  tokenInfo?: any,
  c?: Context<Env>
): Promise<MCPSession | undefined> {
  logger.debug('Creating new session for pure SSE client');
  const session = new MCPSession({
    config: serverConfig,
    gatewayToken: tokenInfo,
    context: c,
  });

  try {
    await session.initializeOrRestore('sse');
    logger.debug(`SSE session ${session.id} initialized`);
    return session;
  } catch (error) {
    logger.error(`Failed to initialize SSE session ${session.id}`, error);
    await deleteSession(session.id);
    return undefined;
  }
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
  session: MCPSession,
  body: any
): Promise<boolean> {
  try {
    const clientTransportType = session.getClientTransportType();
    // Determine transport type
    const acceptHeader = c.req.header('Accept');
    const isCurrentSSERequest =
      c.req.method === 'GET' && acceptHeader?.includes('text/event-stream');
    const detectedTransportType: TransportType = isCurrentSSERequest
      ? 'sse'
      : 'streamable-http';

    const transportType = clientTransportType || detectedTransportType;

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
  const serverConfig = c.var.serverConfig;
  let session = c.var.session;
  let method = c.req.method;

  // Check if server config was found (it might be missing due to auth issues)
  if (!serverConfig) return c.json(ErrorResponses.serverConfigNotFound(), 500);

  // Handle GET requests for established sessions
  if (method === 'GET' && session)
    return handleEstablishedSessionGET(c, session);

  const acceptHeader = c.req.header('Accept');
  if (method === 'GET' && !session && acceptHeader === 'text/event-stream') {
    session = await createSSESession(serverConfig, c.var.tokenInfo);
    if (!session) {
      return c.json(ErrorResponses.sessionNotInitialized(), 500);
    }
    c.set('session', session);
    return handleEstablishedSessionGET(c, session);
  }

  const body = method === 'POST' ? await c.req.json() : null;
  logger.debug(
    `${c.req.method} ${c.req.url} Body: ${body?.method ? body.method : 'null'} Headers: ${JSON.stringify(c.req.raw.headers)}`
  );

  // Check if this is an initialization request
  if (body && isInitializeRequest(body)) {
    try {
      session = await handleInitializeRequest(c, session);
    } catch (error: any) {
      // Check if this is an OAuth authorization error
      if (error.authorizationUrl && error.serverId) {
        logger.info(
          `OAuth authorization required for server ${error.workspaceId}/${error.serverId}`
        );
        return c.json(
          {
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: `Authorization required for ${error.workspaceId}/${error.serverId}. Go to the following URL to complete the OAuth flow: ${error.authorizationUrl}`,
              data: {
                type: 'oauth_required',
                authorizationUrl: error.authorizationUrl,
              },
            },
            id: (body as any)?.id,
          },
          401
        );
      }

      // Other errors
      logger.error('initializationFailed', { body, error });
    }

    if (!session)
      return c.json(
        ErrorResponses.sessionNotInitialized((body as any)?.id),
        500
      );

    const { incoming: req, outgoing: res } = c.env as any;
    logger.debug(`Session ${session.id}: Handling initialize request`);

    // Set session ID header
    if (res?.setHeader) res.setHeader(HEADER_MCP_SESSION_ID, session.id);

    await session.handleRequest(req, res, body);
    logger.debug(`Session ${session.id}: Initialize request completed`);
    return RESPONSE_ALREADY_SENT;
  }

  // For non-initialization requests, require session
  if (!session) {
    // Detect transport type from headers
    const acceptHeader = c.req.header('Accept');
    const isPureSSE = method === 'GET' && acceptHeader === 'text/event-stream';

    if (isPureSSE) {
      const tokenInfo = c.var.tokenInfo;

      session = await createSSESession(serverConfig, tokenInfo, c);
      if (!session) {
        return c.json(ErrorResponses.sessionNotInitialized(), 500);
      }
      c.set('session', session);

      // Handle SSE GET request for newly created session
      return handleEstablishedSessionGET(c, session);
    } else {
      logger.warn(
        `No session found - method: ${method}, sessionId: ${c.req.header(HEADER_MCP_SESSION_ID)}`
      );

      return c.json(ErrorResponses.sessionNotFound(), 404);
    }
  }

  // Ensure session is properly initialized before handling request
  if (session && !isInitializeRequest(body)) {
    const isReady = await prepareSessionForRequest(c, session, body);
    if (!isReady) {
      return c.json(
        ErrorResponses.sessionRestoreFailed((body as any)?.id),
        500
      );
    }
  }

  // Handle request through session
  const { incoming: req, outgoing: res } = c.env as any;

  try {
    logger.debug(`Session ${session.id}: Handling ${method} request`);
    await session.handleRequest(req, res, body);
  } catch (error: any) {
    logger.error(`Error handling request for session ${session.id}`, error);

    if (error?.message?.includes('Session not initialized')) {
      logger.error(
        `CRITICAL: Session ${session.id} initialization failed unexpectedly`
      );
      await deleteSession(session.id);
      return c.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message:
              'Session initialization failed in handleRequest. Please reconnect.',
          },
          id: body?.id || null,
        },
        500
      );
    }

    throw error;
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
    return c.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Session ID required in query parameter',
        },
        id: null,
      },
      400
    );
  }

  const session = await sessionStore.get(sessionId);
  if (!session) {
    logger.warn(`POST /messages: Session ${sessionId} not found`);
    return c.json(ErrorResponses.invalidRequest(), 404);
  }

  // Check if session is expired
  if (session.isTokenExpired()) {
    logger.debug(`SSE session ${sessionId} expired, removing`);
    await deleteSession(sessionId);
    return c.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Session expired',
        },
        id: null,
      },
      401
    );
  }

  // Ensure session is ready for SSE messages
  try {
    const transportType = session.getClientTransportType() || 'sse';
    await session.initializeOrRestore(transportType);
    logger.debug(`Session ${sessionId} ready for SSE messages`);
  } catch (error) {
    logger.error(
      `Failed to prepare session ${sessionId} for SSE messages`,
      error
    );
    await deleteSession(sessionId);
    return c.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message:
            'Failed to restore session during SSE reconnection. Please reinitialize.',
        },
        id: null,
      },
      500
    );
  }

  const body = await c.req.json();
  logger.debug(`Session ${sessionId}: Processing ${body.method} message`);

  const { incoming: req, outgoing: res } = c.env as any;
  const transport = session.getDownstreamTransport() as SSEServerTransport;
  await transport.handlePostMessage(req, res, body);

  return RESPONSE_ALREADY_SENT;
}
