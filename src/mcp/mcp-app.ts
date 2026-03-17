/**
 * MCP Gateway Hono Application
 * Main entry point for the MCP Gateway module
 */

import { Hono, Context } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { getRuntimeKey } from 'hono/adapter';
import { logger } from './utils/logger.js';
import { hydrateContext } from './middleware/hydrateContext.js';
import { controlPlaneMiddleware } from './middleware/controlPlane.js';
import { oauthMiddleware, apiKeyToTokenMapper } from './middleware/oauth/index.js';
import { presignedAuthMiddleware, combinedAuthMiddleware } from './middleware/presignedAuth.js';
import { oauthRoutes } from './routes/oauth.js';
import { wellKnownRoutes } from './routes/wellknown.js';
import { bundleRoutes } from './routes/bundle.js';
import {
  handleMCPRequest,
  handleHealthCheck,
  handleSessionInfo,
  handleCloseSession,
} from './handlers/mcpHandler.js';
import {
  createCacheBackendsLocal,
  createCacheBackendsRedis,
} from '../shared/services/cache/index.js';

const log = logger.child('mcp-app');

// OAuth required flag - set to false for development
const OAUTH_REQUIRED = process.env.MCP_OAUTH_REQUIRED !== 'false';

// Create Hono app for MCP routes
const mcpApp = new Hono();

// =============================================================================
// Initialize Cache Backends
// =============================================================================

// Initialize cache backends - always use local storage for now
// (Redis is optional but not required for MCP Gateway)
let cacheInitialized = false;
console.log('[MCP] Starting cache backend initialization...');
const initCachePromise = (async () => {
  try {
    const redisUrl = process.env.REDIS_URL || process.env.REDIS_CONNECTION_STRING;
    console.log('[MCP] Redis URL:', redisUrl ? 'configured' : 'not configured');
    if (redisUrl) {
      createCacheBackendsRedis(redisUrl);
      console.log('[MCP] Cache backends initialized with Redis');
    } else {
      console.log('[MCP] Creating local cache backends...');
      await createCacheBackendsLocal();
      console.log('[MCP] Cache backends initialized with local storage');
    }
    cacheInitialized = true;
    console.log('[MCP] Cache initialization complete');
  } catch (error) {
    console.error('[MCP] Failed to initialize cache backends:', error);
  }
})();

// =============================================================================
// Wait for cache initialization
// =============================================================================

mcpApp.use('*', async (c, next) => {
  await initCachePromise;
  return next();
});

// =============================================================================
// CORS Setup
// =============================================================================

mcpApp.use(
  '*',
  cors({
    origin: '*', // Configure appropriately for production
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'mcp-session-id',
      'mcp-protocol-version',
      'x-portkey-api-key',
      'x-workspace-id',
    ],
    exposeHeaders: ['mcp-session-id'],
    credentials: true,
  })
);

// =============================================================================
// Control Plane Middleware (fetches server configs)
// =============================================================================

mcpApp.use('*', controlPlaneMiddleware);

// =============================================================================
// Well-Known Routes (OAuth Discovery)
// =============================================================================

mcpApp.route('/.well-known', wellKnownRoutes);

// =============================================================================
// OAuth Routes
// =============================================================================

mcpApp.route('/', oauthRoutes);

// =============================================================================
// Bundle Routes (Presigned URL bundles)
// =============================================================================

mcpApp.route('/bundle', bundleRoutes);

// =============================================================================
// Health Check
// =============================================================================

mcpApp.get('/health', handleHealthCheck);
mcpApp.get('/v1/health', handleHealthCheck);

// =============================================================================
// Admin Routes (optional - for debugging)
// =============================================================================

mcpApp.get('/sessions/:sessionId', async (c) => {
  try {
    return await handleSessionInfo(c);
  } catch (error) {
    if (error instanceof HTTPException) {
      return c.json({ error: error.message }, error.status);
    }
    log.error('Error in session info', { error });
    return c.json({ error: 'Internal server error' }, 500);
  }
});

mcpApp.delete('/sessions/:sessionId', async (c) => {
  try {
    return await handleCloseSession(c);
  } catch (error) {
    if (error instanceof HTTPException) {
      return c.json({ error: error.message }, error.status);
    }
    log.error('Error closing session', { error });
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// =============================================================================
// Auth Middleware Helper
// =============================================================================

// Base header auth middleware (API key or OAuth)
const headerAuthMiddleware = async (c: Context, next: () => Promise<void>) => {
  if (c.req.header('x-portkey-api-key')) {
    return apiKeyToTokenMapper()(c, next);
  } else {
    return oauthMiddleware({
      required: OAUTH_REQUIRED,
      skipPaths: ['/oauth', '/.well-known', '/health', '/bundle'],
    })(c, next);
  }
};

// Combined middleware that checks presigned token first, then falls back to header auth
const authMiddleware = combinedAuthMiddleware(headerAuthMiddleware);

// =============================================================================
// URL Validation Middleware
// =============================================================================

// Middleware to validate URL query parameter
const validateUrlMiddleware = async (c: Context, next: () => Promise<void>) => {
  const encodedUrl = c.req.query('url');

  if (!encodedUrl) {
    throw new HTTPException(400, {
      message: 'Missing required "url" query parameter. Provide base64url-encoded MCP server URL.',
    });
  }

  try {
    // Validate it's a valid base64url string
    const decoded = Buffer.from(encodedUrl, 'base64url').toString('utf-8');
    if (!decoded.startsWith('http://') && !decoded.startsWith('https://')) {
      throw new Error('Invalid URL scheme');
    }
    // Store decoded URL in context for later use
    c.set('serverUrl', decoded);
  } catch (error) {
    throw new HTTPException(400, {
      message: 'Invalid "url" parameter. Must be a valid base64url-encoded HTTP(S) URL.',
    });
  }

  return next();
};

// =============================================================================
// Main MCP Endpoints (URL-based)
// =============================================================================

// Main MCP endpoint: /mcp?url=<base64url_encoded_server_url>
mcpApp.all(
  '/mcp',
  validateUrlMiddleware,
  authMiddleware,
  hydrateContext,
  async (c) => {
    try {
      return await handleMCPRequest(c);
    } catch (error) {
      if (error instanceof HTTPException) {
        return c.json({ error: error.message }, error.status);
      }
      log.error('Error handling MCP request', { error });
      return c.json({ error: 'Internal server error' }, 500);
    }
  }
);

// SSE endpoint: /sse?url=<base64url_encoded_server_url>
mcpApp.get(
  '/sse',
  validateUrlMiddleware,
  authMiddleware,
  hydrateContext,
  async (c) => {
    try {
      // Force SSE response
      c.req.raw.headers.set('accept', 'text/event-stream');
      return await handleMCPRequest(c);
    } catch (error) {
      if (error instanceof HTTPException) {
        return c.json({ error: error.message }, error.status);
      }
      log.error('Error handling SSE request', { error });
      return c.json({ error: 'Internal server error' }, 500);
    }
  }
);

// =============================================================================
// Error Handler
// =============================================================================

mcpApp.onError((err, c) => {
  log.error('MCP Gateway Error', { error: err.message, stack: err.stack });

  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }

  return c.json({ error: 'Internal server error' }, 500);
});

// =============================================================================
// Not Found Handler
// =============================================================================

mcpApp.notFound((c) => {
  return c.json(
    {
      error: 'Not Found',
      message: 'MCP endpoint not found. Available endpoints: /mcp?url=<base64url>, /sse?url=<base64url>, /bundle/:bundleToken',
    },
    404
  );
});

export default mcpApp;
