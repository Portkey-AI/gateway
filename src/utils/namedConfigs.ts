/**
 * Loads the gateway default config from `config.json` at server start.
 * If the file does not exist or cannot be parsed, defaultConfig will be null.
 *
 * The config.json may contain named sub-configs under the `named_configs` key:
 *      {
 *        "named_configs": {
 *          "default": { "provider": "openai", "api_key": "sk-..." },
 *          "ollama_local": { "provider": "ollama", "custom_host": "http://localhost:11434" },
 *          "prod": { "strategy": { "mode": "fallback" }, "targets": [...] }
 *        }
 *      }
 */
import { Environment } from './env';

let _parsedConfig: Record<string, any> | null = null;

try {
  const namedConfigs =Environment()?.NAMED_CONFIGS;
  if (namedConfigs) {
    _parsedConfig = resolveEnvVars(JSON.parse(namedConfigs));
    console.log('✅ NAMED_CONFIGS loaded successfully.');
  }
} catch (err: any) {
  console.warn(
    '⚠️  invalid NAMED_CONFIGS:',
      err?.message
  );
}

/**
 * is true, if a config file exists and namedConfig can be used.
 */
const hasNamedConfigs: boolean = (() => {
  return _parsedConfig ? true : false;
})();


/**
 * Returns a named config from `named_config.json`'s `named_configs` map by name.
 *
 * Example named_config.json:
 * ```json
 * {
 *   "named_configs": {
 *     "default": { "provider": "openai", "api_key": "sk-..." },
 *     "ollama_local": { "provider": "ollama", "custom_host": "http://localhost:11434" },
 *     "prod": {
 *       "strategy": { "mode": "fallback" },
 *       "targets": [{ "provider": "openai", "api_key": "..." }]
 *     }
 *   }
 * }
 * ```
 *
 * @param name - The key inside `named_configs` to look up.
 * @returns The named config as a plain object, or null if not found.
 */
function namedConfig(name?: string | null): string | null {
  const key = name || 'default';
  let result = _parsedConfig?.named_configs?.[key] ?? null;
  if (result) {
	result = JSON.stringify(result);
  }
  console.warn("namedConfig(", name, ") =", result)
  return result ?? null;
}

/**
 * If named configs are available, returns the config for the given name (or "default" if no name provided).
 * Otherwise, returns null.
 *
 * @param name - The key inside `named_configs` to look up, or null/undefined to use "default".
 * @returns The named config as a plain object, or null if not found or if named configs are unavailable.
 */
function processNamedConfig(config?: string | null): string | null {
  if (hasNamedConfigs) {
    return namedConfig(config);
  }
  return config ?? null;
}

/**
 * Recursively replaces "$VAR_NAME" placeholders in all string values
 * of a config object with the corresponding environment variable values.
 * If the environment variable is not set, the placeholder is left as-is.
 */
function resolveEnvVars(obj: any): any {
  if (typeof obj === 'string') {
    return obj.replace(/\$([A-Z_][A-Z0-9_]*)/g, (_, varName) => process.env[varName] ?? `$${varName}`);
  }
  if (Array.isArray(obj)) {
    return obj.map(resolveEnvVars);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, resolveEnvVars(v)]));
  }
  return obj;
}

export { processNamedConfig };
