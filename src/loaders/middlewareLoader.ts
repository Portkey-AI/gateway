import fs from 'fs';
import path from 'path';

export interface LoadedMiddleware {
  handler?: (c: any, next: any) => Promise<any>; // Standard middleware
  wrapApp?: (app: any) => void; // App wrapper function
  name: string;
  pattern?: string;
  type: 'standard' | 'wrapper';
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

          // Check if it's an app wrapper (priority over standard middleware)
          if (typeof module.wrapApp === 'function') {
            middlewares.push({
              wrapApp: module.wrapApp,
              name: metadata.name || file.replace(/\.(ts|js)$/, ''),
              type: 'wrapper',
            });
          }
          // Otherwise, treat as standard middleware
          else {
            const middleware = module.middleware || module.default;

            if (typeof middleware !== 'function') {
              console.warn(
                `⚠️  Skipping ${file}: no middleware or wrapApp function found`
              );
              continue;
            }

            middlewares.push({
              handler: middleware,
              name: metadata.name || file.replace(/\.(ts|js)$/, ''),
              pattern: metadata.pattern || '*',
              type: 'standard',
            });
          }
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
