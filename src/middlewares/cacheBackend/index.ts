import { Context } from 'hono';
import { env, getRuntimeKey } from 'hono/adapter';
import { createMiddleware } from 'hono/factory';
import { createLogger } from '../../utils/logger';
import {
  createCacheBackendsCF,
  createCacheBackendsLocal,
} from '../../services/cache';

const logger = createLogger('mcp/cacheBackendMiddleware');

/**
 * Fetches a session from the session store if it exists.
 * If the session is found, it is set in the context.
 */
export const cacheBackendMiddleware = createMiddleware(
  async (c: Context, next) => {
    const runtime = getRuntimeKey();

    logger.debug('Creating caches for ', runtime);

    switch (runtime) {
      case 'workerd':
        createCacheBackendsCF(env(c));
        break;
      default:
        createCacheBackendsLocal();
    }

    return next();
  }
);
