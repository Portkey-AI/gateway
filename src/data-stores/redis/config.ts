import fs from 'fs';
import { Environment } from '../../utils/env';
import { logger } from '../../apm';
import { externalServiceFetch } from '../../utils/fetch';

const env = Environment({});
let redisConfig: RedisConfig;

export interface AzureRedisConfig {
  authMode: string;
  managedClientId: string;
  entraClientId: string;
  entraClientSecret: string;
  entraTenantId: string;
}
export interface GCPRedisConfig {
  authMode: string;
}

export interface AWSRedisConfig {
  authMode: string;
  clusterName: string;
  region: string;
  assumeRoleArn?: string;
  externalId?: string;
}

export interface RedisConfig {
  redisUrl: string;
  redisPassword: string;
  redisUsername: string;
  redisHost: string;
  redisPort: string;
  redisTLS: string;
  redisMode: string;
  cacheStore: string;
  redisTLSCaCerts: Buffer | undefined;
  azureRedisConfig: AzureRedisConfig;
  awsRedisConfig: AWSRedisConfig;
  gcpRedisConfig: GCPRedisConfig;
  clusterEndpoints?: string;
  clusterDiscoveryUrl?: string;
  clusterDiscoveryAuth?: string;
}

export const CACHE_STORES = {
  REDIS: 'redis',
  AZURE_REDIS: 'azure-redis',
  AWS_ELASTIC_CACHE: 'aws-elastic-cache',
  GCP_MEMORY_STORE: 'gcp-memory-store',
  MEMORY: 'memory',
};

/**
 * Check if the given cache store is a Redis variant
 */
export function isRedisCacheStore(cacheStore: string | undefined): boolean {
  return (
    cacheStore === CACHE_STORES.REDIS ||
    cacheStore === CACHE_STORES.AZURE_REDIS ||
    cacheStore === CACHE_STORES.AWS_ELASTIC_CACHE ||
    cacheStore === CACHE_STORES.GCP_MEMORY_STORE
  );
}

/**
 * Check if Redis configuration is available in the environment
 */
export function hasRedisConfig(): boolean {
  const e = Environment({});
  return !!(
    e.REDIS_URL ||
    e.REDIS_CLUSTER_ENDPOINTS ||
    e.REDIS_CLUSTER_DISCOVERY_URL
  );
}

/**
 * Determine if memory cache should be used based on configuration
 * Returns true if:
 * 1. CACHE_STORE is explicitly set to 'memory'
 * 2. CACHE_STORE is NOT a Redis variant AND no Redis config is available
 */
export function shouldUseMemoryCache(): boolean {
  const e = Environment({});
  const cacheStore = e.CACHE_STORE;
  return (
    cacheStore === CACHE_STORES.MEMORY ||
    (!isRedisCacheStore(cacheStore) && !hasRedisConfig())
  );
}

export const REDIS_MODES = {
  STANDALONE: 'standalone',
  CLUSTER: 'cluster',
};

export const AZURE_REDIS_RESOURCE = 'https://redis.azure.com/';
export const AZURE_REDIS_SCOPE = 'https://redis.azure.com/.default';

/**
 * Parses static Redis cluster endpoints from a comma-separated string
 * @param endpointsString - Comma-separated IP:port pairs (e.g., "10.0.1.1:6379,10.0.1.2:6379")
 * @returns Array of Redis endpoint strings (IP:port format)
 */
export function parseStaticRedisEndpoints(endpointsString: string): string[] {
  logger.info('Parsing static Redis cluster endpoints');

  // Parse comma-separated IP:port pairs
  // Supports IPv4, IPv6, and hostname formats
  const endpoints = endpointsString
    .split(',')
    .map((endpoint) => endpoint.trim())
    .filter((endpoint) => {
      // Validate format: should be IP:port or hostname:port or [IPv6]:port
      // Handle IPv6 format: [host]:port
      if (endpoint.startsWith('[')) {
        const match = endpoint.match(/^\[([^\]]+)\]:(\d+)$/);
        return match !== null;
      }
      // Handle standard format: host:port
      const lastColon = endpoint.lastIndexOf(':');
      if (lastColon === -1) return false;
      const port = endpoint.substring(lastColon + 1);
      const host = endpoint.substring(0, lastColon);
      return host.length > 0 && port.length > 0 && !isNaN(Number(port));
    });

  if (endpoints.length === 0) {
    throw new Error('No valid Redis endpoints found in static configuration');
  }

  logger.info(
    `Parsed ${endpoints.length} static Redis cluster endpoints: ${endpoints.join(', ')}`
  );
  return endpoints;
}

/**
 * Fetches Redis cluster endpoints from an HTTPS URL
 * @param discoveryUrl - HTTPS URL that returns comma-separated IP:port pairs
 * @param authHeader - Optional authorization header for the discovery endpoint
 * @returns Array of Redis endpoint strings (IP:port format)
 */
export async function fetchRedisClusterEndpoints(
  discoveryUrl: string,
  authHeader?: string
): Promise<string[]> {
  // Validate HTTPS for security
  if (!discoveryUrl.startsWith('https://')) {
    throw new Error(
      `Discovery URL must use HTTPS for security. Received: ${discoveryUrl.substring(0, 20)}...`
    );
  }

  try {
    const headers: Record<string, string> = {};
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    logger.info(`Fetching Redis cluster endpoints from: ${discoveryUrl}`);

    const response = await externalServiceFetch(discoveryUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch Redis endpoints: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.text();

    // Parse comma-separated IP:port pairs
    // Supports IPv4, IPv6, and hostname formats
    const endpoints = data
      .split(',')
      .map((endpoint) => endpoint.trim())
      .filter((endpoint) => {
        // Validate format: should be IP:port or hostname:port or [IPv6]:port
        // Handle IPv6 format: [host]:port
        if (endpoint.startsWith('[')) {
          const match = endpoint.match(/^\[([^\]]+)\]:(\d+)$/);
          return match !== null;
        }
        // Handle standard format: host:port
        const lastColon = endpoint.lastIndexOf(':');
        if (lastColon === -1) return false;
        const port = endpoint.substring(lastColon + 1);
        const host = endpoint.substring(0, lastColon);
        return host.length > 0 && port.length > 0 && !isNaN(Number(port));
      });

    if (endpoints.length === 0) {
      throw new Error('No valid Redis endpoints found in discovery response');
    }

    logger.info(
      `Discovered ${endpoints.length} Redis cluster endpoints: ${endpoints.join(', ')}`
    );
    return endpoints;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error fetching Redis cluster endpoints: ${errorMessage}`);
    throw error;
  }
}

/**
 * Gets Redis cluster endpoints with caching support
 * @param discoveryUrl - HTTPS URL that returns comma-separated IP:port pairs
 * @param authHeader - Optional authorization header
 * @param refreshIntervalMs - Cache refresh interval in milliseconds (default: 5 minutes)
 * @returns Array of Redis endpoint strings
 */
export async function getRedisClusterEndpoints(
  discoveryUrl: string,
  authHeader?: string
): Promise<string[]> {
  const endpoints = await fetchRedisClusterEndpoints(discoveryUrl, authHeader);
  return endpoints;
}

export function getRedisConfig(): RedisConfig {
  if (redisConfig) {
    return redisConfig;
  }
  const {
    REDIS_URL: redisUrl,
    REDIS_TLS_ENABLED: redisTLS,
    REDIS_MODE: redisMode,
    CACHE_STORE: cacheStore,
    REDIS_TLS_CERTS: redisTLSCerts,
    REDIS_PORT: redisPort,
    REDIS_USERNAME: redisUsername,
    REDIS_PASSWORD: redisPassword,
    AZURE_AUTH_MODE: azureAuthMode,
    AZURE_ENTRA_CLIENT_ID: azureEntraClientId,
    AZURE_ENTRA_CLIENT_SECRET: azureEntraClientSecret,
    AZURE_ENTRA_TENANT_ID: azureEntraTenantId,
    AZURE_MANAGED_CLIENT_ID: azureManagedClientId,
    AZURE_REDIS_AUTH_MODE: azureRedisAuthMode,
    AZURE_REDIS_ENTRA_CLIENT_ID: azureRedisEntraClientId,
    AZURE_REDIS_ENTRA_CLIENT_SECRET: azureRedisEntraClientSecret,
    AZURE_REDIS_ENTRA_TENANT_ID: azureRedisEntraTenantId,
    AZURE_REDIS_MANAGED_CLIENT_ID: azureRedisManagedClientId,
    AWS_REDIS_AUTH_MODE: awsRedisAuthMode,
    AWS_REDIS_CLUSTER_NAME: awsRedisClusterName,
    AWS_REDIS_REGION: awsRedisRegion,
    AWS_REDIS_ASSUME_ROLE_ARN: awsRedisAssumeRoleArn,
    AWS_REDIS_ROLE_EXTERNAL_ID: awsRedisRoleExternalId,
    GCP_AUTH_MODE: gcpAuthMode,
    GCP_REDIS_AUTH_MODE: gcpRedisAuthMode,
    REDIS_CLUSTER_ENDPOINTS: clusterEndpoints,
    REDIS_CLUSTER_DISCOVERY_URL: clusterDiscoveryUrl,
    REDIS_CLUSTER_DISCOVERY_AUTH: clusterDiscoveryAuth,
  } = env;

  const redisTLSCaCerts = redisTLSCerts
    ? fs.readFileSync(redisTLSCerts)
    : undefined;

  const finalRedisUrl = constructRedisUrl(
    redisUrl,
    redisPort,
    redisUsername,
    redisPassword
  );

  const redisDetails = getRedisDetails(finalRedisUrl);

  redisConfig = {
    redisUrl: finalRedisUrl,
    redisTLS,
    redisMode: redisMode || REDIS_MODES.STANDALONE,
    cacheStore,
    redisTLSCaCerts,
    azureRedisConfig: {
      authMode: azureRedisAuthMode || azureAuthMode,
      managedClientId: azureRedisManagedClientId || azureManagedClientId,
      entraClientId: azureRedisEntraClientId || azureEntraClientId,
      entraClientSecret: azureRedisEntraClientSecret || azureEntraClientSecret,
      entraTenantId: azureRedisEntraTenantId || azureEntraTenantId,
    },
    awsRedisConfig: {
      authMode: awsRedisAuthMode,
      clusterName: awsRedisClusterName,
      region: awsRedisRegion,
      assumeRoleArn: awsRedisAssumeRoleArn,
      externalId: awsRedisRoleExternalId,
    },
    gcpRedisConfig: {
      authMode: gcpRedisAuthMode || gcpAuthMode,
    },
    redisPassword: redisDetails.password,
    redisUsername: redisDetails.username,
    redisHost: redisDetails.host,
    redisPort: redisDetails.port,
    clusterEndpoints,
    clusterDiscoveryUrl,
    clusterDiscoveryAuth,
  };
  return redisConfig;
}

function constructRedisUrl(
  redisUrl: string,
  redisPort: string,
  redisUsername: string,
  redisPassword: string
) {
  try {
    // Handle Kubernetes tcp:// format or extract port from redisPort if it's a URL
    if (redisPort && !Number(redisPort)) {
      try {
        const portUrl = new URL(redisPort);
        redisPort = portUrl.port || '6379';
      } catch {
        // If parsing redisPort as URL fails, try parsing redisUrl
        redisPort = '6379';
      }
    }
    // Check if redisUrl already contains redis:// protocol
    if (redisUrl.startsWith('redis://') || redisUrl.startsWith('rediss://')) {
      const parsedUrl = new URL(redisUrl);
      // Extract existing credentials and host info
      const existingUsername = parsedUrl.username;
      const existingPassword = parsedUrl.password;
      const host = parsedUrl.hostname;
      const existingPort = parsedUrl.port;
      // Use provided credentials if available, otherwise fall back to existing ones
      let finalUsername = existingUsername || redisUsername || '';
      let finalPassword = existingPassword || redisPassword || '';
      const finalPort = existingPort || redisPort || '6379';
      // Construct the final URL
      const protocol = redisUrl.startsWith('rediss://')
        ? 'rediss://'
        : 'redis://';
      if (finalUsername) {
        finalUsername = encodeURIComponent(decodeURIComponent(finalUsername));
      }
      if (finalPassword) {
        finalPassword = encodeURIComponent(decodeURIComponent(finalPassword));
      }
      if (finalUsername || finalPassword) {
        return `${protocol}${finalUsername || ''}:${finalPassword || ''}@${host}:${finalPort}`;
      }
      return `${protocol}${host}:${finalPort}`;
    } else {
      // Handle case where redisUrl is just hostname/IP
      const [existingHost, existingPort] = redisUrl.split(':');
      const finalPort = existingPort || redisPort || '6379';
      const finalHost = existingHost?.trim() || 'redis';
      if (redisUsername || redisPassword) {
        const finalUsername = encodeURIComponent(
          decodeURIComponent(redisUsername || '')
        );
        const finalPassword = encodeURIComponent(
          decodeURIComponent(redisPassword || '')
        );
        return `redis://${finalUsername || ''}:${finalPassword || ''}@${finalHost}:${finalPort}`;
      }
      return `redis://${finalHost}:${finalPort}`;
    }
  } catch (error) {
    // Fallback to default if URL parsing fails
    return `redis://redis:6379`;
  }
}

function getRedisDetails(url: string) {
  const parsedUrl = new URL(url);
  return {
    host: parsedUrl.hostname,
    port: parsedUrl.port,
    username: decodeURIComponent(parsedUrl.username || ''),
    password: decodeURIComponent(parsedUrl.password || ''),
  };
}
