import fs from 'fs';
import path from 'path';

export async function loadExternalPlugins(pluginsDirs: string[]) {
  const externalPlugins: Record<string, any> = {};
  const debug = process.env.DEBUG_PLUGINS === 'true';

  if (debug) {
    console.log('[pluginLoader] Loading external plugins from:', pluginsDirs);
  }

  for (const dir of pluginsDirs) {
    // Resolve to absolute path - handles both relative and absolute paths
    const absoluteDir = path.resolve(dir);

    if (debug) {
      console.log('[pluginLoader] Scanning directory:', absoluteDir);
    }

    if (!fs.existsSync(absoluteDir)) {
      console.warn(`⚠️  Plugin directory not found: ${absoluteDir}`);
      continue;
    }

    try {
      // Scan directory for plugin folders
      const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });

      if (debug) {
        console.log(
          '[pluginLoader] Found entries:',
          entries.map((e) => e.name)
        );
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const pluginPath = path.resolve(absoluteDir, entry.name);
        const manifestPath = path.resolve(pluginPath, 'manifest.json');

        if (debug) {
          console.log(
            '[pluginLoader] Checking plugin:',
            entry.name,
            'at',
            pluginPath
          );
        }

        if (!fs.existsSync(manifestPath)) {
          console.warn(`⚠️  Skipping ${entry.name}: no manifest.json found`);
          continue;
        }

        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          const pluginId = manifest.id || entry.name;

          if (debug) {
            console.log(
              '[pluginLoader] Loading plugin:',
              pluginId,
              'with functions:',
              manifest.functions?.map((f: any) => f.id)
            );
          }

          externalPlugins[pluginId] = {};

          // Load each function handler
          for (const func of manifest.functions || []) {
            // Only support .js files for external plugins (should be pre-transpiled)
            const funcPath = path.resolve(pluginPath, `${func.id}.js`);

            if (debug) {
              console.log(
                '[pluginLoader] Looking for function file:',
                funcPath
              );
            }

            if (!fs.existsSync(funcPath)) {
              console.warn(
                `⚠️  Function ${func.id} not found in ${pluginId} (expected ${func.id}.js)`
              );
              continue;
            }

            try {
              if (debug) {
                console.log('[pluginLoader] Importing:', funcPath);
              }

              // Dynamically import the handler
              const module = await import(funcPath);

              if (debug) {
                console.log(
                  '[pluginLoader] Module exports:',
                  Object.keys(module)
                );
              }

              if (typeof module.handler !== 'function') {
                console.warn(
                  `⚠️  ${func.id} in ${pluginId}: 'handler' export is not a function`
                );
                continue;
              }

              externalPlugins[pluginId][func.id] = module.handler;

              if (debug) {
                console.log(
                  '[pluginLoader] Loaded function:',
                  pluginId + '.' + func.id
                );
              }
            } catch (error: any) {
              console.warn(
                `⚠️  Error loading function ${func.id} in ${pluginId}: ${error.message}`
              );
              if (debug) {
                console.warn(`⚠️  Stack: ${error.stack}`);
              }
            }
          }

          if (debug) {
            console.log(
              '[pluginLoader] Plugin',
              pluginId,
              'loaded with functions:',
              Object.keys(externalPlugins[pluginId])
            );
          }
        } catch (error: any) {
          console.warn(
            `⚠️  Error loading plugin ${entry.name}: ${error.message}`
          );
        }
      }
    } catch (error: any) {
      console.warn(
        `⚠️  Error scanning plugin directory ${dir}: ${error.message}`
      );
    }
  }

  if (debug) {
    console.log(
      '[pluginLoader] All external plugins loaded:',
      Object.keys(externalPlugins)
    );
  }

  return externalPlugins;
}

export function mergePlugins(
  builtInPlugins: Record<string, any>,
  externalPlugins: Record<string, any>
) {
  // Merge: external plugins added, built-in takes precedence on conflicts
  const merged = { ...externalPlugins };

  // Add/override with built-in plugins
  for (const [key, value] of Object.entries(builtInPlugins)) {
    if (key in merged) {
      // Built-in takes precedence: merge functions
      merged[key] = {
        ...merged[key],
        ...value,
      };
    } else {
      merged[key] = value;
    }
  }

  return merged;
}
