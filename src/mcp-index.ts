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

import { ServerConfig } from './types/mcp';
import { MCPSession } from './services/mcpSession';
import { SessionStore } from './services/sessionStore';
import { createLogger } from './utils/logger';
import { handleMCPRequest, handleSSEMessages } from './handlers/mcpHandler';

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
  return handleMCPRequest(c, sessionStore);
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
    return handleSSEMessages(c, sessionStore);
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
