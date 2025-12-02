import fs from 'fs';
import path from 'path';
import { ProviderConfigs } from '../providers/types';

export interface LoadedProvider {
  name: string;
  config: ProviderConfigs;
}

/**
 * Load external providers from specified directories.
 *
 * Each provider should be a subdirectory containing:
 * - index.js: Must export default ProviderConfigs and optionally export metadata
 * - package.json: Optional, for provider dependencies
 *
 * @param providerDirs - Array of directory paths to scan for providers
 * @returns Array of loaded providers with name and config
 */
export async function loadExternalProviders(
  providerDirs: string[]
): Promise<LoadedProvider[]> {
  const providers: LoadedProvider[] = [];

  for (const dir of providerDirs) {
    // Resolve to absolute path - handles both relative and absolute paths
    const absoluteDir = path.resolve(dir);

    if (!fs.existsSync(absoluteDir)) {
      console.warn(`⚠️  Provider directory not found: ${absoluteDir}`);
      continue;
    }

    try {
      // Scan directory for provider subdirectories
      const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });

      for (const entry of entries) {
        // Skip non-directories and special files
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.')) continue;
        if (entry.name === 'node_modules') continue;

        const providerPath = path.resolve(absoluteDir, entry.name);
        const indexPath = path.resolve(providerPath, 'index.js');

        if (!fs.existsSync(indexPath)) {
          console.warn(
            `⚠️  Skipping ${entry.name}: no index.js found in ${providerPath}`
          );
          continue;
        }

        try {
          // Dynamically import the provider module
          const module = await import(indexPath);
          const config = module.default;
          const metadata = module.metadata || {};

          // Validate provider config
          if (!config) {
            console.warn(
              `⚠️  Skipping ${entry.name}: no default export found in index.js`
            );
            continue;
          }

          if (!config.api) {
            console.warn(
              `⚠️  Skipping ${entry.name}: provider config missing required 'api' property`
            );
            continue;
          }

          // Validate api has required functions
          const api = config.api;
          if (typeof api.headers !== 'function') {
            console.warn(
              `⚠️  Skipping ${entry.name}: api.headers must be a function`
            );
            continue;
          }
          if (typeof api.getBaseURL !== 'function') {
            console.warn(
              `⚠️  Skipping ${entry.name}: api.getBaseURL must be a function`
            );
            continue;
          }
          if (typeof api.getEndpoint !== 'function') {
            console.warn(
              `⚠️  Skipping ${entry.name}: api.getEndpoint must be a function`
            );
            continue;
          }

          // Get provider name from metadata or directory name
          const providerName = metadata.name || entry.name;

          // Warn if no endpoint configs defined (provider may be incomplete)
          const endpointKeys = Object.keys(config).filter(
            (k) =>
              k !== 'api' &&
              k !== 'responseTransforms' &&
              k !== 'requestTransforms' &&
              k !== 'requestHandlers' &&
              k !== 'getConfig'
          );
          if (endpointKeys.length === 0) {
            console.warn(
              `⚠️  Provider ${providerName} has no endpoint configs (chatComplete, embed, etc.)`
            );
          }

          providers.push({
            name: providerName,
            config: config as ProviderConfigs,
          });
        } catch (error: any) {
          console.warn(
            `⚠️  Error loading provider ${entry.name}: ${error.message}`
          );
        }
      }
    } catch (error: any) {
      console.warn(
        `⚠️  Error scanning provider directory ${dir}: ${error.message}`
      );
    }
  }

  return providers;
}
