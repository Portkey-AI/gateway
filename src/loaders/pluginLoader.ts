import fs from 'fs';
import path from 'path';

export async function loadExternalPlugins(pluginsDirs: string[]) {
  const externalPlugins: Record<string, any> = {};

  for (const dir of pluginsDirs) {
    if (!fs.existsSync(dir)) {
      console.warn(`⚠️  Plugin directory not found: ${dir}`);
      continue;
    }

    try {
      // Scan directory for plugin folders
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const pluginPath = path.join(dir, entry.name);
        const manifestPath = path.join(pluginPath, 'manifest.json');

        if (!fs.existsSync(manifestPath)) {
          console.warn(`⚠️  Skipping ${entry.name}: no manifest.json found`);
          continue;
        }

        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          const pluginId = manifest.id || entry.name;

          externalPlugins[pluginId] = {};

          // Load each function handler
          for (const func of manifest.functions || []) {
            // Try .ts first, then .js
            let funcPath = path.join(pluginPath, `${func.id}.ts`);
            if (!fs.existsSync(funcPath)) {
              funcPath = path.join(pluginPath, `${func.id}.js`);
            }
            if (!fs.existsSync(funcPath)) {
              console.warn(`⚠️  Function ${func.id} not found in ${pluginId}`);
              continue;
            }

            try {
              // Dynamically import the handler
              const handler = await import(funcPath);
              externalPlugins[pluginId][func.id] = handler.handler;
            } catch (error: any) {
              console.warn(
                `⚠️  Error loading function ${func.id} in ${pluginId}: ${error.message}`
              );
            }
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
