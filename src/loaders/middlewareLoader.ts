import fs from 'fs';
import path from 'path';

export interface LoadedMiddleware {
  handler: ((c: any, next: any) => Promise<any>) | ((app: any) => void);
  name: string;
  pattern?: string;
  isPlugin: boolean; // true if middleware() returns (app) => void, false if it's (c, next) => Promise
}

export async function loadExternalMiddlewares(
  middlewareDirs: string[]
): Promise<LoadedMiddleware[]> {
  const middlewares: LoadedMiddleware[] = [];

  for (const dir of middlewareDirs) {
    // Resolve to absolute path - handles both relative and absolute paths
    const absoluteDir = path.resolve(dir);

    if (!fs.existsSync(absoluteDir)) {
      console.warn(`⚠️  Middleware directory not found: ${absoluteDir}`);
      continue;
    }

    try {
      const files = fs.readdirSync(absoluteDir);

      for (const file of files) {
        // Only support .js files for external middlewares (should be pre-transpiled)
        if (!file.endsWith('.js')) continue;

        const filePath = path.resolve(absoluteDir, file);

        try {
          const module = await import(filePath);
          const metadata = module.metadata || {};

          const middleware = module.middleware || module.default;

          if (typeof middleware !== 'function') {
            console.warn(`⚠️  Skipping ${file}: no middleware function found`);
            continue;
          }

          // Check if it's a plugin-style middleware
          // Plugin: middleware() returns (app) => void
          // Standard: middleware is (c, next) => Promise<any>
          let isPlugin = false;
          let handler = middleware;

          // If middleware is a function that returns a function, it's a plugin
          if (middleware.length === 0) {
            // No parameters - likely middleware() that returns a function
            try {
              const result = middleware();
              if (typeof result === 'function') {
                // It's a plugin - the result is the app handler
                isPlugin = true;
                handler = result;
              } else {
                // middleware() returned non-function, use original middleware
                isPlugin = false;
                handler = middleware;
              }
            } catch (e) {
              // If calling middleware() throws, treat as standard middleware
              isPlugin = false;
              handler = middleware;
            }
          }

          middlewares.push({
            handler,
            name: metadata.name || file.replace(/\.(ts|js)$/, ''),
            pattern: metadata.pattern || '*',
            isPlugin,
          });
        } catch (error: any) {
          console.warn(
            `⚠️  Error loading middleware ${file}: ${error.message}`
          );
        }
      }
    } catch (error: any) {
      console.warn(
        `⚠️  Error scanning middleware directory ${dir}: ${error.message}`
      );
    }
  }

  return middlewares;
}
