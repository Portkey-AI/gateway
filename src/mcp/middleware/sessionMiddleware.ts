import { createMiddleware } from 'hono/factory';
import { MCPSession } from '../services/mcpSession';
import { getSessionStore } from '../services/sessionStore';
import { createLogger } from '../../shared/utils/logger';
import { HEADER_MCP_SESSION_ID } from '../../mcp/constants/mcp';
import { ControlPlane } from './controlPlane';

const logger = createLogger('mcp/sessionMiddleware');

type Env = {
  Variables: {
    session?: MCPSession;
    controlPlane?: ControlPlane;
  };
};

// REMOVED FROM FLOW FOR LATER!!!

/**
 * Fetches a session from the session store if it exists.
 * If the session is found, it is set in the context.
 */
export const sessionMiddleware = createMiddleware<Env>(async (c, next) => {
  const sessionStore = getSessionStore();
  const headerSessionId = c.req.header(HEADER_MCP_SESSION_ID);
  const querySessionId = c.req.query('sessionId');
  const sessionId = headerSessionId || querySessionId;

  if (sessionId) {
    const session = await sessionStore.get(sessionId, c);

    if (session) {
      // Check if session is expired based on token expiration
      if (session.isTokenExpired()) {
        logger.debug(
          `Session ${sessionId} expired due to token expiration, removing`
        );
        await sessionStore.delete(sessionId);
      } else {
        logger.debug(
          `Session ${sessionId} found, initialized: ${session.isInitialized}`
        );
        c.set('session', session);
      }
    } else {
      logger.debug(`Session ID ${sessionId} provided but not found in store`);
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

  await next();
});
