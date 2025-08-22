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
import { oauthMiddleware } from './middlewares/oauth';
import { localOAuth } from './services/localOAuth';
import { hydrateContext } from './middlewares/mcp/hydrateContext';
import { sessionMiddleware } from './middlewares/mcp/sessionMiddleware';
import { oauthRoutes } from './routes/oauth';
import { wellKnownRoutes } from './routes/wellknown';

const logger = createLogger('MCP-Gateway');

type Env = {
  Variables: {
    serverConfig: ServerConfig;
    session?: MCPSession;
    tokenInfo?: any;
    isAuthenticated?: boolean;
  };
  Bindings: {
    ALBUS_BASEPATH?: string;
  };
};

// Session storage - persistent across restarts
const sessionStore = new SessionStore({
  dataDir: process.env.SESSION_DATA_DIR || './data',
  persistInterval: 30 * 1000, // Save every 30 seconds
  maxAge: 60 * 60 * 1000, // 1 hour session timeout
});

// OAuth configuration - always required for security
const OAUTH_REQUIRED = true; // Force OAuth for all requests

const app = new Hono<Env>();

// CORS setup for browser clients
app.use(
  '*',
  cors({
    origin: '*', // Configure appropriately for production
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'mcp-session-id',
      'mcp-protocol-version',
    ],
    exposeHeaders: ['mcp-session-id', 'WWW-Authenticate'],
    credentials: true, // Allow cookies and authorization headers
  })
);

// Mount route groups
app.route('/oauth', oauthRoutes);
app.route('/.well-known', wellKnownRoutes);

app.get('/', (c) => {
  logger.debug('Root endpoint accessed');
  return c.json({
    gateway: 'Portkey MCP Gateway',
    version: '0.1.0',
    endpoints: {
      mcp: '/:serverId/mcp',
      health: '/health',
      oauth: {
        discovery: '/.well-known/oauth-authorization-server',
        resource: '/.well-known/oauth-protected-resource',
      },
    },
  });
});

/**
 * Main MCP endpoint with transport detection
 */
app.all(
  '/:serverId/mcp',
  oauthMiddleware({
    required: OAUTH_REQUIRED,
    scopes: ['mcp:servers:read'],
    skipPaths: ['/oauth', '/.well-known'],
  }),
  hydrateContext,
  sessionMiddleware(sessionStore),
  async (c) => {
    return handleMCPRequest(c, sessionStore);
  }
);

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
  oauthMiddleware({
    required: OAUTH_REQUIRED,
    scopes: ['mcp:servers:*', 'mcp:*'],
    skipPaths: ['/oauth', '/.well-known'],
  }),
  hydrateContext,
  sessionMiddleware(sessionStore),
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
  // Also clean up expired OAuth tokens
  localOAuth.cleanupExpiredTokens();
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
