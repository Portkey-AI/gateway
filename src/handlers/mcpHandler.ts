/**
 * @file src/handlers/mcpHandler.ts
 * MCP (Model Context Protocol) request handler
 *
 * Performance-optimized handler functions for MCP requests
 */

import { Context } from 'hono';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types';
import { RESPONSE_ALREADY_SENT } from '@hono/node-server/utils/response';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse';

import { ServerConfig } from '../types/mcp';
import { MCPSession, TransportType } from '../services/mcpSession';
import { SessionStore } from '../services/sessionStore';
import { createLogger } from '../utils/logger';

const logger = createLogger('MCP-Handler');

type Env = {
  Variables: {
    serverConfig: ServerConfig;
    session?: MCPSession;
    tokenInfo?: any; // Token introspection response
    isAuthenticated?: boolean;
  };
  Bindings: {
    ALBUS_BASEPATH?: string;
  };
};

/**
 * Error response utilities - inline for performance
 */
export const ErrorResponses = {
  sessionRequired: (id: any = null) => ({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Session required. Please initialize first.',
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

  initializationFailed: (id: any = null) => ({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'Failed to initialize session',
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
 * Inline function for performance-critical path
 */
export async function handleInitializeRequest(
  c: Context<Env>,
  session: MCPSession | undefined,
  sessionStore: SessionStore,
  body: any
): Promise<MCPSession | undefined> {
  // Determine client transport type
  const clientTransportType: TransportType = 'streamable-http';
  logger.debug('Initialize request - defaulting to streamable-http transport');

  // Create new session if needed
  if (!session) {
    logger.info(`Creating new session for server: ${c.req.param('serverId')}`);
    const serverConfig = c.var.serverConfig;
    session = new MCPSession(serverConfig);

    // Set token expiration for session lifecycle
    const tokenInfo = c.var.tokenInfo;
    if (tokenInfo) {
      session.setTokenExpiration(tokenInfo);
      logger.debug(
        `Session ${session.id} created with token expiration tracking`
      );
    }

    sessionStore.set(session.id, session);
  }

  logger.debug(
    `Session ${session.id}: Client requesting ${clientTransportType} transport`
  );

  try {
    await session.initializeOrRestore(clientTransportType);
    const capabilities = session.getTransportCapabilities();
    logger.info(
      `Session ${session.id}: Transport established ${capabilities?.clientTransport} -> ${capabilities?.upstreamTransport}`
    );
    return session;
  } catch (error) {
    logger.error(`Failed to initialize session ${session.id}`, error);
    sessionStore.delete(session.id);
    return undefined;
  }
}

/**
 * Setup SSE connection for a session
 * Extracted for clarity while maintaining performance
 */
export function setupSSEConnection(
  res: any,
  session: MCPSession,
  sessionStore: SessionStore
): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Session-Id': session.id,
  });

  // Handle connection cleanup on close/error
  const cleanupSession = () => {
    logger.info(`SSE connection closed for session ${session.id}`);
    sessionStore.delete(session.id);
    session.close().catch((err) => logger.error('Error closing session', err));
  };

  res.on('close', cleanupSession);
  res.on('error', (error: any) => {
    logger.error(`SSE connection error for session ${session.id}`, error);
    cleanupSession();
  });
}

/**
 * Handle GET request for established session
 */
export async function handleEstablishedSessionGET(
  c: Context<Env>,
  session: MCPSession,
  sessionStore: SessionStore
): Promise<any> {
  const clientTransportType = session.getClientTransportType();

  if (!clientTransportType) {
    logger.error(`Session ${session.id} has no transport type set`);
    return c.json(ErrorResponses.sessionNotInitialized(), 500);
  }

  // Ensure session is active or can be restored
  try {
    await session.initializeOrRestore(clientTransportType);
    logger.debug(
      `Session ${session.id} ready for ${clientTransportType} connection`
    );
  } catch (error) {
    logger.error(`Failed to prepare session ${session.id}`, error);
    sessionStore.delete(session.id);
    return c.json(ErrorResponses.sessionRestoreFailed(), 500);
  }

  const { incoming: req, outgoing: res } = c.env as any;

  // Route based on transport type
  if (clientTransportType === 'sse') {
    setupSSEConnection(res, session, sessionStore);
    const transport = session.initializeSSETransport(res);
    await transport.start();
    return RESPONSE_ALREADY_SENT;
  } else {
    // For Streamable HTTP clients
    await session.handleRequest(req, res);
    return RESPONSE_ALREADY_SENT;
  }
}

/**
 * Create SSE session for pure SSE clients
 */
export async function createSSESession(
  serverConfig: ServerConfig,
  sessionStore: SessionStore,
  tokenInfo?: any
): Promise<MCPSession | undefined> {
  logger.info('Creating new session for pure SSE client');
  const session = new MCPSession(serverConfig);

  // Set token expiration for session lifecycle
  if (tokenInfo) {
    session.setTokenExpiration(tokenInfo);
    logger.debug(
      `SSE session ${session.id} created with token expiration tracking`
    );
  }

  sessionStore.set(session.id, session);

  try {
    await session.initializeOrRestore('sse');
    logger.info(`SSE session ${session.id} initialized`);
    return session;
  } catch (error) {
    logger.error(`Failed to initialize SSE session ${session.id}`, error);
    sessionStore.delete(session.id);
    return undefined;
  }
}

/**
 * Prepare session for request handling
 * Returns true if session is ready, false if failed
 */
export async function prepareSessionForRequest(
  c: Context<Env>,
  session: MCPSession,
  sessionStore: SessionStore,
  body: any
): Promise<boolean> {
  try {
    // Determine transport type
    const acceptHeader = c.req.header('Accept');
    const isCurrentSSERequest =
      c.req.method === 'GET' && acceptHeader?.includes('text/event-stream');
    const detectedTransportType: TransportType = isCurrentSSERequest
      ? 'sse'
      : 'streamable-http';

    const transportType =
      session.getTransportCapabilities()?.clientTransport ||
      detectedTransportType;

    await session.initializeOrRestore(transportType);
    logger.debug(`Session ${session.id} ready for request handling`);
    return true;
  } catch (error) {
    logger.error(`Failed to prepare session ${session.id}`, error);
    sessionStore.delete(session.id);
    return false;
  }
}

/**
 * Main MCP request handler
 * This is the optimized entry point that delegates to specific handlers
 */
export async function handleMCPRequest(
  c: Context<Env>,
  sessionStore: SessionStore
) {
  logger.debug(`${c.req.method} ${c.req.url}`, { headers: c.req.raw.headers });

  const serverConfig = c.var.serverConfig;
  let session = c.var.session;

  // Check if server config was found (it might be missing due to auth issues)
  if (!serverConfig) {
    // This happens when hydrateContext returns early due to auth issues
    // The response should already be set by hydrateContext
    return;
  }

  // Detect transport type from headers
  const acceptHeader = c.req.header('Accept');

  // Parse body for POST requests
  const body = c.req.method === 'POST' ? await c.req.json() : null;
  logger.debug(`Body: ${body ? JSON.stringify(body, null, 2) : 'null'}`);

  // Check if this is an initialization request
  if (body && isInitializeRequest(body)) {
    session = await handleInitializeRequest(c, session, sessionStore, body);

    if (!session) {
      logger.error('initializationFailed', body);
      return c.json(
        ErrorResponses.initializationFailed((body as any)?.id),
        500
      );
    }

    const { incoming: req, outgoing: res } = c.env as any;
    logger.debug(`Session ${session.id}: Handling initialize request`);

    // Set session ID header
    if (res?.setHeader) {
      res.setHeader('mcp-session-id', session.id);
    }

    await session.handleRequest(req, res, body);
    logger.debug(`Session ${session.id}: Initialize request completed`);
    return RESPONSE_ALREADY_SENT;
  }

  // Handle GET requests for established sessions
  if (c.req.method === 'GET' && session) {
    return handleEstablishedSessionGET(c, session, sessionStore);
  }

  // For non-initialization requests, require session
  if (!session) {
    const isPureSSE =
      c.req.method === 'GET' && acceptHeader === 'text/event-stream';

    if (isPureSSE) {
      const tokenInfo = c.var.tokenInfo;
      session = await createSSESession(serverConfig, sessionStore, tokenInfo);
      if (!session) {
        return c.json(ErrorResponses.initializationFailed(), 500);
      }
      c.set('session', session);
    } else {
      logger.warn(
        `No session found - method: ${c.req.method}, sessionId: ${c.req.header('mcp-session-id')}`
      );

      if (c.req.method === 'POST') {
        return c.json(ErrorResponses.sessionRequired(), 400);
      } else {
        return c.json(ErrorResponses.sessionNotFound(), 404);
      }
    }
  }

  // Ensure session is properly initialized before handling request
  if (session && !isInitializeRequest(body)) {
    const isReady = await prepareSessionForRequest(
      c,
      session,
      sessionStore,
      body
    );
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
    logger.debug(`Session ${session.id}: Handling ${c.req.method} request`);
    await session.handleRequest(req, res, body);
  } catch (error: any) {
    logger.error(`Error handling request for session ${session.id}`, error);

    if (error?.message?.includes('Session not initialized')) {
      logger.error(
        `CRITICAL: Session ${session.id} initialization failed unexpectedly`
      );
      sessionStore.delete(session.id);
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
export async function handleSSEMessages(
  c: Context<Env>,
  sessionStore: SessionStore
) {
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

  const session = sessionStore.get(sessionId);
  if (!session) {
    logger.warn(`POST /messages: Session ${sessionId} not found`);
    return c.json(ErrorResponses.sessionNotFound(), 404);
  }

  // Check if session is expired
  if (session.isTokenExpired()) {
    logger.info(`SSE session ${sessionId} expired, removing`);
    sessionStore.delete(sessionId);
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
    sessionStore.delete(sessionId);
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
