/**
 * @file src/mcp-index.ts
 * Portkey MCP Gateway
 *
 * Run this on something like mcp.portkey.ai or mcp.yourdomain.com
 * and route to any MCP server with full confidence.
 */

import { Context, Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { cors } from 'hono/cors';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types';
import { RESPONSE_ALREADY_SENT } from '@hono/node-server/utils/response';

import { ServerConfig } from './types/mcp';
import { MCPSession, TransportType } from './services/mcpSession';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse';
import { SessionStore } from './services/sessionStore';
import { createLogger } from './utils/logger';

const logger = createLogger('MCP-Gateway');

type Env = {
  Variables: {
    serverConfig: ServerConfig;
    session?: MCPSession;
  };
};

// Session storage - persistent across restarts
const sessionStore = new SessionStore({
  dataDir: process.env.SESSION_DATA_DIR || './data',
  persistInterval: 30 * 1000, // Save every 30 seconds
  maxAge: 60 * 60 * 1000, // 1 hour session timeout
});

const hydrateContext = createMiddleware<Env>(async (c, next) => {
  const serverId = c.req.param('serverId');

  if (!serverId) {
    next();
  }

  // In production, load from database/API
  // For now, we'll use a hardcoded config
  const configs: Record<string, ServerConfig> = {
    linear: {
      serverId: 'linear',
      url: process.env.LINEAR_MCP_URL || 'https://mcp.linear.app/sse',
      headers: {
        Authorization: `Bearer 51fc2928-f14e-4f24-ae6a-362338d26de7:TNs0lgV03mSevGhi:rukYArsbt0QldSXb4qN8lCUE9049OmxF`,
      },
      tools: {
        blocked: ['deleteProject', 'deleteIssue'], // Block destructive operations
        rateLimit: { requests: 100, window: 60 },
        logCalls: true,
      },
    },
    deepwiki: {
      serverId: 'deepwiki',
      url: 'https://mcp.deepwiki.com/mcp',
      headers: {},
    },
  };

  c.set('serverConfig', configs[serverId as keyof typeof configs]);
  await next();
});

// Middleware to get session from header
const sessionMiddleware = createMiddleware<Env>(async (c, next) => {
  const sessionId = c.req.header('mcp-session-id');

  if (sessionId) {
    const session = sessionStore.get(sessionId);
    if (session) {
      logger.debug(
        `Session ${sessionId} found, initialized: ${session.isInitialized}`
      );
      c.set('session', session);
    } else {
      logger.warn(`Session ID ${sessionId} provided but not found in store`);
    }
  }

  await next();
});

const app = new Hono<Env>();

// CORS setup for browser clients
app.use(
  '*',
  cors({
    origin: '*', // Configure appropriately for production
    allowHeaders: ['Content-Type', 'mcp-session-id', 'mcp-protocol-version'],
    exposeHeaders: ['mcp-session-id'],
  })
);

app.get('/', (c) => {
  logger.debug('Root endpoint accessed');
  return c.json({
    gateway: 'Portkey MCP Gateway',
    version: '0.1.0',
    endpoints: {
      mcp: '/:serverId/mcp',
      health: '/health',
    },
  });
});

/**
 * Main MCP endpoint with transport detection
 */
app.all('/:serverId/mcp', hydrateContext, sessionMiddleware, async (c) => {
  logger.debug(`${c.req.method} ${c.req.url}`, { headers: c.req.raw.headers });
  const serverConfig = c.var.serverConfig;
  let session = c.var.session;

  // Detect transport type from headers
  const acceptHeader = c.req.header('Accept');
  const isSSERequest =
    c.req.method === 'GET' && acceptHeader?.includes('text/event-stream');

  // Parse body for POST requests
  const body = c.req.method === 'POST' ? await c.req.json() : null;
  logger.debug(`Body: ${body ? JSON.stringify(body, null, 2) : 'null'}`);

  // Check if this is an initialization request
  if (body && isInitializeRequest(body)) {
    // Determine client transport type from request
    // For now, assume POST with initialize = streamable-http
    // Real SSE clients would establish the event stream first
    const clientTransportType: TransportType = 'streamable-http';

    logger.debug(
      `Initialize request - defaulting to streamable-http transport`
    );

    // Create new session if needed
    if (!session) {
      logger.info(
        `Creating new session for server: ${c.req.param('serverId')}`
      );

      // Normal new session creation
      session = new MCPSession(serverConfig);
      sessionStore.set(session.id, session);
    }

    // Initialize or restore the session
    logger.debug(
      `Session ${session.id}: Client requesting ${clientTransportType} transport`
    );

    try {
      // Use the new initializeOrRestore method
      await session.initializeOrRestore(clientTransportType);

      const capabilities = session.getTransportCapabilities();
      logger.info(
        `Session ${session.id}: Transport established ${capabilities?.clientTransport} -> ${capabilities?.upstreamTransport}`
      );
    } catch (error) {
      logger.error(`Failed to initialize session ${session.id}`, error);
      sessionStore.delete(session.id);
      session = undefined;
    }

    // Handle the request if session is valid
    if (!session) {
      logger.error('Failed to create or restore session');
      return c.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Failed to initialize session',
          },
          id: (body as any)?.id || null,
        },
        500
      );
    }

    // Handle the request
    const { incoming: req, outgoing: res } = c.env as any;
    logger.debug(`Session ${session.id}: Handling initialize request`);

    // Set session ID header for client
    if (res && res.setHeader) {
      res.setHeader('mcp-session-id', session.id);
    }

    await session.handleRequest(req, res, body);
    logger.debug(`Session ${session.id}: Initialize request completed`);

    return RESPONSE_ALREADY_SENT;
  }

  // Handle GET requests for established sessions
  // Both SSE and Streamable HTTP use GET requests with event-stream accept headers
  if (c.req.method === 'GET' && session) {
    // Get the transport type that was determined during initialization
    const clientTransportType = session.getClientTransportType();

    if (!clientTransportType) {
      logger.error(`Session ${session.id} has no transport type set`);
      return c.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Session not properly initialized',
          },
          id: null,
        },
        500
      );
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

      return c.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Failed to restore session. Please reinitialize.',
          },
          id: null,
        },
        500
      );
    }

    const { incoming: req, outgoing: res } = c.env as any;

    // Route based on the actual transport type, not the accept header
    if (clientTransportType === 'sse') {
      // For true SSE clients, set up the SSE stream
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Session-Id': session.id,
      });

      // Handle connection cleanup on close/error
      const currentSession = session;
      res.on('close', () => {
        logger.info(`SSE connection closed for session ${currentSession.id}`);
        sessionStore.delete(currentSession.id);
        currentSession
          .close()
          .catch((err) => logger.error('Error closing session', err));
      });

      res.on('error', (error: any) => {
        logger.error(
          `SSE connection error for session ${currentSession.id}`,
          error
        );
        sessionStore.delete(currentSession.id);
        currentSession
          .close()
          .catch((err) => logger.error('Error closing session', err));
      });

      // Initialize the SSE transport with the response object
      const transport = session.initializeSSETransport(res);

      // Start the SSE transport
      await transport.start();

      return RESPONSE_ALREADY_SENT;
    } else {
      // For Streamable HTTP clients, let the transport handle the request
      await session.handleRequest(req, res);
      return RESPONSE_ALREADY_SENT;
    }
  }

  // For non-initialization requests, require session
  if (!session) {
    // For GET requests without session, check if it's a true SSE client
    // True SSE clients will have ONLY text/event-stream in Accept header
    const isPureSSE =
      c.req.method === 'GET' && acceptHeader === 'text/event-stream';

    if (isPureSSE) {
      logger.info('Creating new session for pure SSE client');
      session = new MCPSession(serverConfig);
      sessionStore.set(session.id, session);
      c.set('session', session);

      // Initialize the session with SSE transport
      try {
        await session.initializeOrRestore('sse');
        logger.info(`SSE session ${session.id} initialized`);
      } catch (error) {
        logger.error(`Failed to initialize SSE session ${session.id}`, error);
        sessionStore.delete(session.id);
        return c.json(
          {
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Failed to initialize SSE session',
            },
            id: null,
          },
          500
        );
      }
    } else {
      logger.warn(
        `No session found - method: ${c.req.method}, sessionId: ${c.req.header('mcp-session-id')}`
      );
      if (c.req.method === 'POST') {
        return c.json(
          {
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Session required. Please initialize first.',
            },
            id: null,
          },
          400
        );
      } else {
        return c.json(
          {
            jsonrpc: '2.0',
            error: {
              code: -32001,
              message: 'Session not found',
            },
            id: null,
          },
          404
        );
      }
    }
  }

  // Ensure session is properly initialized before handling request
  if (session && !isInitializeRequest(body)) {
    try {
      // Determine transport type from request or use saved capabilities
      const acceptHeader = c.req.header('Accept');
      const isCurrentSSERequest =
        c.req.method === 'GET' && acceptHeader?.includes('text/event-stream');
      const detectedTransportType: TransportType = isCurrentSSERequest
        ? 'sse'
        : 'streamable-http';

      // Use detected transport type or fall back to saved capabilities
      const transportType =
        session.getTransportCapabilities()?.clientTransport ||
        detectedTransportType;

      // This will handle all states (dormant, active, initializing) appropriately
      await session.initializeOrRestore(transportType);
      logger.debug(`Session ${session.id} ready for request handling`);
    } catch (error) {
      logger.error(`Failed to prepare session ${session.id}`, error);
      sessionStore.delete(session.id);

      return c.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Failed to restore session. Please reinitialize.',
          },
          id: (body as any)?.id || null,
        },
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

    // If this is a session initialization error, try to clean up and respond
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

    // Re-throw other errors
    throw error;
  }

  return RESPONSE_ALREADY_SENT;
});

/**
 * SSE endpoint - simple redirect to main MCP endpoint
 * The main /mcp endpoint already handles SSE through transport detection
 */
app.get('/:serverId/sse', async (c) => {
  logger.debug(`SSE GET ${c.req.url}`);
  const serverId = c.req.param('serverId');
  // Redirect with SSE-compatible headers
  return c.redirect(`/${serverId}/mcp`, 302);
});

/**
 * POST endpoint for SSE message handling
 * Handles messages from SSE clients
 */
app.post(
  '/:serverId/messages',
  hydrateContext,
  sessionMiddleware,
  async (c) => {
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
      return c.json(
        {
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Session not found',
          },
          id: null,
        },
        404
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

    // Access the underlying Node.js request/response
    const { incoming: req, outgoing: res } = c.env as any;

    // Handle the message through the SSE transport
    const transport = session.getDownstreamTransport() as SSEServerTransport;
    await transport.handlePostMessage(req, res, body);

    return RESPONSE_ALREADY_SENT;
  }
);

/**
 * Health check endpoint
 */
app.get('/health', (c) => {
  const stats = sessionStore.getStats();
  logger.debug('Health check accessed');

  return c.json({
    status: 'healthy',
    sessions: stats,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Catch-all route for all other requests
app.all('*', (c) => {
  logger.debug(`Unhandled route: ${c.req.method} ${c.req.url}`);
  return c.json({ status: 'not found' }, 404);
});

/**
 * Clean up inactive sessions periodically
 * Note: SessionStore handles its own cleanup and persistence
 */
setInterval(async () => {
  await sessionStore.cleanup();
}, 60 * 1000); // Run every minute

// Load existing sessions on startup
sessionStore
  .loadSessions()
  .then(() => {
    logger.critical('Session recovery completed');
  })
  .catch((error) => {
    logger.error('Session recovery failed', error);
  });

// Graceful shutdown handler
process.on('SIGINT', async () => {
  logger.critical('Shutting down gracefully...');
  await sessionStore.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.critical('Shutting down gracefully...');
  await sessionStore.stop();
  process.exit(0);
});

export default app;
