/**
 * Example external middleware: request logger.
 *
 * Logs method, path, model, and response status for every request.
 * Demonstrates the middleware factory pattern.
 *
 * Config options:
 *   - verbose (boolean): log request body summary. Default: false.
 *
 * Usage in conf.json:
 *   {
 *     "middleware": [
 *       { "name": "request-logger", "config": { "verbose": true } }
 *     ]
 *   }
 */
module.exports = function (config) {
  const verbose = config.verbose ?? false;

  return async (c, next) => {
    const start = Date.now();
    const method = c.req.method;
    const path = c.req.path;

    if (verbose) {
      console.log(`[request-logger] ${method} ${path}`);
    }

    await next();

    const duration = Date.now() - start;
    console.log(
      `[request-logger] ${method} ${path} → ${c.res.status} (${duration}ms)`
    );
  };
};
