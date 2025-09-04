/**
 * @file src/mcp-index.ts
 * Portkey MCP Gateway
 *
 * Run this on something like mcp.portkey.ai or mcp.yourdomain.com
 * and route to any MCP server with full confidence.
 */

import 'dotenv/config';

import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { ServerConfig } from './types/mcp';
import { MCPSession } from './services/mcpSession';
import { getSessionStore } from './services/sessionStore';
import { createLogger } from './utils/logger';
import { handleMCPRequest, handleSSEMessages } from './handlers/mcpHandler';
import { oauthMiddleware } from './middlewares/oauth';
import { hydrateContext } from './middlewares/mcp/hydrateContext';
import { sessionMiddleware } from './middlewares/mcp/sessionMiddleware';
import { oauthRoutes } from './routes/oauth';
import { wellKnownRoutes } from './routes/wellknown';
import { controlPlaneMiddleware } from './middlewares/controlPlane';
import { cacheBackendMiddleware } from './middlewares/cacheBackend';

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
    CLIENT_ID?: string;
  };
};

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

app.use(controlPlaneMiddleware);
app.use(cacheBackendMiddleware);

// Mount route groups
app.route('/oauth', oauthRoutes);
app.route('/.well-known', wellKnownRoutes);

app.get('/', (c) => {
  logger.debug('Root endpoint accessed');
  return c.json({
    gateway: 'Portkey MCP Gateway',
    version: '0.1.0',
    endpoints: {
      mcp: ':workspaceId/:serverId/mcp',
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
  '/:workspaceId/:serverId/mcp',
  oauthMiddleware({
    required: OAUTH_REQUIRED,
    skipPaths: ['/oauth', '/.well-known'],
  }),
  hydrateContext,
  sessionMiddleware,
  async (c) => {
    return handleMCPRequest(c);
  }
);

/**
 * SSE endpoint - simple redirect to main MCP endpoint
 * The main /mcp endpoint already handles SSE through transport detection
 */
app.get('/:workspaceId/:serverId/sse', async (c) => {
  logger.debug(`SSE GET ${c.req.url}`);
  const workspaceId = c.req.param('workspaceId');
  const serverId = c.req.param('serverId');
  // Redirect with SSE-compatible headers
  return c.redirect(`/${workspaceId}/${serverId}/mcp`, 302);
});

/**
 * POST endpoint for SSE message handling
 * Handles messages from SSE clients
 */
app.post(
  '/:workspaceId/:serverId/messages',
  oauthMiddleware({
    required: OAUTH_REQUIRED,
    scopes: ['mcp:servers:*', 'mcp:*'],
    skipPaths: ['/oauth', '/.well-known'],
  }),
  hydrateContext,
  sessionMiddleware,
  async (c) => {
    return handleSSEMessages(c);
  }
);

/**
 * Health check endpoint
 */
app.get('/health', async (c) => {
  // Get the singleton session store instance
  const sessionStore = getSessionStore();
  const stats = await sessionStore.getStats();
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
  logger.info(`Unhandled route: ${c.req.method} ${c.req.url}`);
  return c.json({ status: 'not found' }, 404);
});

async function shutdown() {
  logger.critical('Shutting down gracefully...');
  const sessionStore = getSessionStore();
  await sessionStore.stop();
  process.exit(0);
}

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  await shutdown();
});

process.on('SIGTERM', async () => {
  await shutdown();
});

export default app;
