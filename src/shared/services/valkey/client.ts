/**
 * @file src/shared/services/valkey/client.ts
 * Shared Valkey GLIDE client factory and connection string parser.
 */
import { GlideClient, GlideClusterClient } from '@valkey/valkey-glide';

export interface ValkeyClientOptions {
  useTLS?: boolean;
  password?: string;
  requestTimeout?: number;
  cluster?: boolean;
}

/**
 * Create a standalone (non-cluster) GlideClient connected to a single Valkey node.
 * GLIDE requires async initialization - there is no sync/lazy alternative.
 */
export async function createStandaloneClient(
  host: string,
  port: number,
  options?: ValkeyClientOptions
): Promise<GlideClient> {
  const config: any = {
    addresses: [{ host, port }],
    useTLS: options?.useTLS ?? false,
    requestTimeout: options?.requestTimeout ?? 5000,
    advancedConfiguration: { connectionTimeout: 5000 },
  };

  if (options?.password) {
    config.credentials = { password: options.password };
  }

  return await GlideClient.createClient(config);
}

export async function createClusterClient(
  addresses: Array<{ host: string; port: number }>,
  options?: ValkeyClientOptions
): Promise<GlideClusterClient> {
  const config: any = {
    addresses,
    useTLS: options?.useTLS ?? false,
    requestTimeout: options?.requestTimeout ?? 5000,
    advancedConfiguration: { connectionTimeout: 5000 },
  };
  if (options?.password) {
    config.credentials = { password: options.password };
  }
  return await GlideClusterClient.createClient(config);
}

export async function createValkeyClient(
  addresses: Array<{ host: string; port: number }>,
  options?: ValkeyClientOptions
): Promise<GlideClient | GlideClusterClient> {
  if (options?.cluster) {
    return createClusterClient(addresses, options);
  }
  return createStandaloneClient(addresses[0].host, addresses[0].port, options);
}

/**
 * Parse a Valkey/Redis connection string into addresses and options.
 * Supported schemes: valkey://, valkeys://, redis://, rediss://
 * TLS is enabled for valkeys:// and rediss:// schemes.
 *
 * Multi-seed cluster format: valkey://host1:6379,host2:6380?cluster=true
 * GLIDE will discover all nodes via CLUSTER SLOTS; additional seeds improve
 * bootstrap resilience.
 */
export function parseValkeyConnectionString(connectionString: string): {
  addresses: Array<{ host: string; port: number }>;
  options: ValkeyClientOptions;
} {
  const redact = (s: string) => s.replace(/\/\/[^@]*@/, '//***@');

  const schemeMatch = connectionString.match(/^([a-zA-Z]+):\/\//);
  if (!schemeMatch) {
    throw new Error(
      `Invalid Valkey connection string: "${redact(connectionString)}". ` +
        'Expected format: valkey://[password@]host:port[,host2:port2][?cluster=true]'
    );
  }

  const scheme = schemeMatch[1].toLowerCase();
  const supportedSchemes = ['valkey', 'valkeys', 'redis', 'rediss'];
  if (!supportedSchemes.includes(scheme)) {
    throw new Error(
      `Unsupported scheme "${scheme}" in Valkey connection string. ` +
        `Supported schemes: ${supportedSchemes.join(', ')}`
    );
  }

  const afterScheme = connectionString.slice(schemeMatch[0].length);
  const queryStart = afterScheme.search(/[?#]/);
  const authorityPart =
    queryStart >= 0 ? afterScheme.slice(0, queryStart) : afterScheme;
  const queryPart = queryStart >= 0 ? afterScheme.slice(queryStart + 1) : '';

  // Extract optional password (user:pass@hosts or :pass@hosts)
  let password: string | undefined;
  let hostsPart = authorityPart;
  const atIndex = authorityPart.lastIndexOf('@');
  if (atIndex >= 0) {
    const credentials = authorityPart.slice(0, atIndex);
    const colonIndex = credentials.indexOf(':');
    if (colonIndex >= 0) {
      const raw = credentials.slice(colonIndex + 1);
      password = raw ? decodeURIComponent(raw) : undefined;
    }
    hostsPart = authorityPart.slice(atIndex + 1);
  }

  if (!hostsPart) {
    throw new Error(
      `Missing host in Valkey connection string: "${redact(connectionString)}"`
    );
  }

  const addresses = hostsPart.split(',').map((hostStr) => {
    const trimmed = hostStr.trim();
    const colonIdx = trimmed.lastIndexOf(':');
    if (colonIdx <= 0) {
      return { host: trimmed, port: 6379 };
    }
    const host = trimmed.slice(0, colonIdx);
    const portStr = trimmed.slice(colonIdx + 1);
    const port = parseInt(portStr, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error(
        `Invalid port "${portStr}" in Valkey connection string: "${redact(connectionString)}"`
      );
    }
    return { host, port };
  });

  if (!addresses[0].host) {
    throw new Error(
      `Missing host in Valkey connection string: "${redact(connectionString)}"`
    );
  }

  const params = queryPart ? new URLSearchParams(queryPart) : null;
  const cluster = params?.get('cluster') === 'true' ? true : undefined;
  const useTLS = scheme === 'valkeys' || scheme === 'rediss';

  return {
    addresses,
    options: {
      useTLS,
      ...(password ? { password } : {}),
      ...(cluster ? { cluster } : {}),
    },
  };
}
