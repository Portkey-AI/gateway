export interface MiddlewareEntry {
  name: string;
  config: Record<string, any>;
  enabled: boolean;
}

export interface MiddlewareConfig {
  middlewareDir: string;
  entries: MiddlewareEntry[];
}

export function parseMiddlewareConfig(
  conf: Record<string, any>,
  cliMiddlewaresDir?: string
): MiddlewareConfig {
  const middlewareDir =
    cliMiddlewaresDir ?? conf.middleware_dir ?? './middleware';
  const raw = conf.middleware;

  if (!Array.isArray(raw)) {
    return { middlewareDir, entries: [] };
  }

  const entries: MiddlewareEntry[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry.name !== 'string' || !entry.name) {
      throw new Error(
        `Invalid middleware entry: each entry must have a 'name' string. Got: ${JSON.stringify(entry)}`
      );
    }
    if (entry.enabled === false) continue;
    entries.push({
      name: entry.name,
      config: entry.config ?? {},
      enabled: true,
    });
  }

  return { middlewareDir, entries };
}
