/**
 * @file src/mcp-index.ts
 * Portkey MCP Gateway
 *
 * Run this on something like mcp.portkey.ai or mcp.yourdomain.com
 * and route to any MCP server with full confidence.
 */

import { Context, Hono } from 'hono';
import { cors } from 'hono/cors';

import { ServerConfig } from './types/mcp';
import { MCPSession } from './services/mcpSession';
import { createLogger } from '../shared/utils/logger';
import {
  handleMCPRequest,
  handleSSEMessages,
  handleSSERequest,
} from './handlers/mcpHandler';
import { apiKeyToTokenMapper, oauthMiddleware } from './middleware/oauth';
import { hydrateContext } from './middleware/hydrateContext';
import { oauthRoutes } from './routes/oauth';
import { wellKnownRoutes } from './routes/wellknown';
import { adminRoutes } from './routes/admin';
import { controlPlaneMiddleware } from './middleware/controlPlane';
import { cacheBackendMiddleware } from './middleware/cacheBackend';
import { HTTPException } from 'hono/http-exception';
import { getRuntimeKey } from 'hono/adapter';
import {
  createCacheBackendsLocal,
  createCacheBackendsRedis,
} from '../shared/services/cache';
import { getBaseUrl } from './utils/mcp-utils';
import { redisClient } from '../data-stores/redis';
import { Environment } from '../utils/env';

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

logger.info('Waiting for Redis client to be ready...');
await new Promise<void>((resolve) => {
  if (
    redisClient &&
    (redisClient.status === 'ready' || redisClient.status === 'connect')
  ) {
    resolve();
  } else {
    const checkInterval = setInterval(() => {
      if (
        redisClient &&
        (redisClient.status === 'ready' || redisClient.status === 'connect')
      ) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);
  }
});
logger.info('Redis client is ready');

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

if (getRuntimeKey() === 'workerd') {
  app.use(cacheBackendMiddleware);
} else if (getRuntimeKey() === 'node' && Environment({}).REDIS_URL) {
  createCacheBackendsRedis(Environment({}).REDIS_URL);
} else {
  createCacheBackendsLocal();
}

// Mount route groups
app.route('/oauth', oauthRoutes);
app.route('/.well-known', wellKnownRoutes);
app.route('/admin', adminRoutes);

/**
 * Global error handler.
 * If error is instance of HTTPException, returns the custom response.
 * Otherwise, logs the error and returns a JSON response with status code 500.
 */
app.onError((err, c) => {
  console.error('Global Error Handler: ', err.message, err.cause, err.stack);
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  if (err.cause && 'needsAuth' in (err.cause as any)) {
    const wid = (err.cause as any).workspaceId;
    const sid = (err.cause as any).serverId;
    return c.json(
      {
        error: 'unauthorized',
        error_description:
          'The upstream access token is invalid or has expired',
      },
      401,
      {
        'WWW-Authenticate': `Bearer resource_metadata="${getBaseUrl(c).origin}/.well-known/oauth-protected-resource/${wid}/${sid}/mcp`,
      }
    );
  }
  c.status(500);
  return c.json({ status: 'failure', message: err.message });
});

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
 * Health check endpoint
 */
app.get('/health', async (c) => {
  logger.debug('Health check accessed');

  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

app.get('/v1/health', async (c) => {
  logger.debug('Health check accessed');

  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Main MCP endpoint with transport detection
 */
app.all(
  '/:workspaceId/:serverId/mcp',
  async (c: Context, next) => {
    if (c.req.header('x-portkey-api-key')) {
      return apiKeyToTokenMapper()(c, next);
    } else {
      return oauthMiddleware({
        required: OAUTH_REQUIRED,
        skipPaths: ['/oauth', '/.well-known'],
      })(c, next);
    }
  },
  hydrateContext,
  async (c) => {
    return handleMCPRequest(c);
  }
);

/**
 * Main MCP endpoint with transport detection
 */
app.all(
  '/:serverId/mcp',
  async (c: Context, next) => {
    if (c.req.header('x-portkey-api-key')) {
      return apiKeyToTokenMapper()(c, next);
    } else {
      return oauthMiddleware({
        required: OAUTH_REQUIRED,
        skipPaths: ['/oauth', '/.well-known'],
      })(c, next);
    }
  },
  hydrateContext,
  async (c) => {
    return handleMCPRequest(c);
  }
);

/**
 * SSE endpoint - simple redirect to main MCP endpoint
 * The main /mcp endpoint already handles SSE through transport detection
 */
app.get(
  '/:workspaceId/:serverId/sse',
  async (c: Context, next) => {
    if (c.req.header('x-portkey-api-key')) {
      return apiKeyToTokenMapper()(c, next);
    } else {
      return oauthMiddleware({
        required: OAUTH_REQUIRED,
        skipPaths: ['/oauth', '/.well-known'],
      })(c, next);
    }
  },
  hydrateContext,
  async (c) => {
    return handleSSERequest(c);
  }
);

/**
 * SSE endpoint - simple redirect to main MCP endpoint
 * The main /mcp endpoint already handles SSE through transport detection
 */
app.get(
  '/:serverId/sse',
  async (c: Context, next) => {
    if (c.req.header('x-portkey-api-key')) {
      return apiKeyToTokenMapper()(c, next);
    } else {
      return oauthMiddleware({
        required: OAUTH_REQUIRED,
        skipPaths: ['/oauth', '/.well-known'],
      })(c, next);
    }
  },
  hydrateContext,
  async (c) => {
    return handleSSERequest(c);
  }
);

/**
 * POST endpoint for SSE message handling
 * Handles messages from SSE clients
 */
app.post(
  '/:workspaceId/:serverId/messages',
  async (c: Context, next) => {
    if (c.req.header('x-portkey-api-key')) {
      return apiKeyToTokenMapper()(c, next);
    } else {
      return oauthMiddleware({
        required: OAUTH_REQUIRED,
        skipPaths: ['/oauth', '/.well-known'],
      })(c, next);
    }
  },
  hydrateContext,
  async (c) => {
    return handleSSEMessages(c);
  }
);

/**
 * POST endpoint for SSE message handling
 * Handles messages from SSE clients
 */
app.post(
  '/:serverId/messages',
  async (c: Context, next) => {
    if (c.req.header('x-portkey-api-key')) {
      return apiKeyToTokenMapper()(c, next);
    } else {
      return oauthMiddleware({
        required: OAUTH_REQUIRED,
        skipPaths: ['/oauth', '/.well-known'],
      })(c, next);
    }
  },
  hydrateContext,
  async (c) => {
    return handleSSEMessages(c);
  }
);

// Catch-all route for all other requests
app.all('*', (c) => {
  logger.info(`Unhandled route: ${c.req.method} ${c.req.url}`);
  return c.json({ status: 'not found' }, 404);
});

async function shutdown() {
  logger.critical('Shutting down gracefully...');
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
