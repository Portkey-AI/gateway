import { createMiddleware } from 'hono/factory';
import { MCPSession } from '../../services/mcpSession';
import { SessionStore } from '../../services/sessionStore';
import { createLogger } from '../../utils/logger';

const logger = createLogger('mcp/sessionMiddleware');

type Env = {
  Variables: {
    serverConfig: any;
    session?: MCPSession;
    tokenInfo?: any;
    isAuthenticated?: boolean;
  };
};

export const sessionMiddleware = (sessionStore: SessionStore) =>
  createMiddleware<Env>(async (c, next) => {
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
