import fs from 'fs';
import path from 'path';

export interface LoadedMiddleware {
  handler: ((c: any, next: any) => Promise<any>) | ((app: any) => void);
  name: string;
  pattern?: string;
  appExtension: boolean; // true if middleware modifies app instance (wraps fetch, adds routes), false if it's standard request middleware
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

          // Check if it's an app extension middleware using metadata
          // App Extension: metadata.appExtension === true, and middleware() returns (app) => void
          // Standard: metadata.appExtension === false or not set, and middleware is (c, next) => Promise<any>
          let appExtension = metadata.appExtension === true;
          let handler = middleware;

          // If metadata declares it's an app extension, execute middleware() to get the app handler
          if (appExtension) {
            try {
              const result = middleware();
              if (typeof result === 'function') {
                // It's an app extension - the result is the app handler
                handler = result;
              } else {
                // Metadata said appExtension but didn't return function - fall back to standard
                console.warn(
                  `⚠️  ${file} marked as appExtension but middleware() didn't return a function`
                );
                appExtension = false;
                handler = middleware;
              }
            } catch (e) {
              // If calling middleware() throws, log error and skip
              console.warn(
                `⚠️  Error executing appExtension ${file}: ${(e as any).message}`
              );
              continue;
            }
          }

          middlewares.push({
            handler,
            name: metadata.name || file.replace(/\.(ts|js)$/, ''),
            pattern: metadata.pattern || '*',
            appExtension,
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
