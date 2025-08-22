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
        // Check if session is expired based on token expiration
        if (session.isTokenExpired()) {
          logger.info(
            `Session ${sessionId} expired due to token expiration, removing`
          );
          sessionStore.delete(sessionId);
          // Don't set session - let handler create new one if needed
        } else {
          logger.debug(
            `Session ${sessionId} found, initialized: ${session.isInitialized}`
          );
          c.set('session', session);
        }
      } else {
        // Log potential session reconnaissance
        const tokenInfo = c.var.tokenInfo;
        if (tokenInfo) {
          logger.warn(
            `Session not found but user authenticated - possible session probe`,
            {
              sessionId,
              userId: tokenInfo.sub || tokenInfo.user_id,
              clientId: tokenInfo.client_id,
              requestPath: c.req.path,
            }
          );
        } else {
          logger.debug(
            `Session ID ${sessionId} provided but not found in store`
          );
        }
      }
    }

    await next();
  });
