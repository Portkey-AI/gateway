import fs from 'fs';
import path from 'path';

export interface LoadedMiddleware {
  handler: (c: any, next: any) => Promise<any>;
  name: string;
  pattern?: string;
}

export async function loadExternalMiddlewares(
  middlewareDirs: string[]
): Promise<LoadedMiddleware[]> {
  const middlewares: LoadedMiddleware[] = [];

  for (const dir of middlewareDirs) {
    if (!fs.existsSync(dir)) {
      console.warn(`⚠️  Middleware directory not found: ${dir}`);
      continue;
    }

    try {
      const files = fs.readdirSync(dir);

      for (const file of files) {
        if (!file.endsWith('.ts') && !file.endsWith('.js')) continue;

        const filePath = path.join(dir, file);

        try {
          const module = await import(filePath);
          const middleware = module.middleware || module.default;
          const metadata = module.metadata || {};

          if (typeof middleware !== 'function') {
            console.warn(`⚠️  Skipping ${file}: no middleware function found`);
            continue;
          }

          middlewares.push({
            handler: middleware,
            name: metadata.name || file.replace(/\.(ts|js)$/, ''),
            pattern: metadata.pattern || '*',
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
