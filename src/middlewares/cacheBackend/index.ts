import { Context } from 'hono';
import { env } from 'hono/adapter';
import { createMiddleware } from 'hono/factory';
import { createCacheBackendsCF } from '../../services/cache';

export const cacheBackendMiddleware = createMiddleware(
  async (c: Context, next) => {
    createCacheBackendsCF(env(c));
    return next();
  }
);
