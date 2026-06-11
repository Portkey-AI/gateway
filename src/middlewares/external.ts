import type { Hono } from 'hono';
import type { Context, Next } from 'hono';
import path from 'path';
import fs from 'fs';
import { MiddlewareConfig } from '../types/middlewareConfig';
import { logger } from '../apm';

const EXTENSIONS = ['.js', '.mjs'];

/**
 * Load external middleware factories from a directory and register them on the
 * Hono app in config order. Each file exports a factory function that receives
 * a config object and returns a standard Hono middleware.
 *
 * Throws on missing files, bad exports, or factory errors — the gateway should
 * refuse to start rather than silently skip broken middleware.
 */
export async function loadExternalMiddleware(
  app: Hono,
  config: MiddlewareConfig
): Promise<void> {
  if (config.entries.length === 0) return;

  for (const entry of config.entries) {
    let resolvedPath: string | null = null;
    for (const ext of EXTENSIONS) {
      const candidate = path.resolve(
        config.middlewareDir,
        `${entry.name}${ext}`
      );
      if (fs.existsSync(candidate)) {
        resolvedPath = candidate;
        break;
      }
    }

    if (!resolvedPath) {
      const tried = EXTENSIONS.map((ext) =>
        path.resolve(config.middlewareDir, `${entry.name}${ext}`)
      ).join(', ');
      throw new Error(`Middleware '${entry.name}' not found at ${tried}`);
    }

    let factory: (config: Record<string, any>) => any;
    try {
      // Use require() for .js (CJS), import() for .mjs (ESM)
      let mod: any;
      if (resolvedPath.endsWith('.mjs')) {
        mod = await import(resolvedPath);
      } else {
        mod = require(resolvedPath);
      }
      factory = mod.default ?? mod;
    } catch (err: any) {
      throw new Error(
        `Middleware '${entry.name}' failed to import from ${resolvedPath}: ${err.message}`
      );
    }

    if (typeof factory !== 'function') {
      throw new Error(
        `Middleware '${entry.name}' does not export a factory function`
      );
    }

    let middlewareFn: (c: Context, next: Next) => Promise<void>;
    try {
      middlewareFn = await factory(entry.config);
    } catch (err: any) {
      throw new Error(
        `Middleware '${entry.name}' failed to initialize: ${err.message}`
      );
    }

    if (typeof middlewareFn !== 'function') {
      throw new Error(
        `Middleware '${entry.name}' factory did not return a function`
      );
    }

    // Wrap with error reporting so runtime errors identify the middleware
    const wrappedFn = async (c: Context, next: Next): Promise<void> => {
      try {
        await middlewareFn(c, next);
      } catch (err: any) {
        err.message = `[middleware:${entry.name}] ${err.message}`;
        throw err;
      }
    };

    app.use('*', wrappedFn);
    logger.info(`Loaded external middleware: ${entry.name}`);
  }
}
