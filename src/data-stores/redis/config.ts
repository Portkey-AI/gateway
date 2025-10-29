import fs from 'fs';
import { Environment } from '../../utils/env';

const env = Environment({});
let redisConfig: RedisConfig;

interface RedisConfig {
  redisUrl: string;
  redisPassword: string;
  redisUsername: string;
  redisHost: string;
  redisPort: string;
  redisTLS: string;
  redisMode: string;
  cacheStore: string;
  redisTLSCaCerts: Buffer | undefined;
  azureRedisConfig: {
    authMode: string;
    managedClientId: string;
    entraClientId: string;
    entraClientSecret: string;
    entraTenantId: string;
  };
}

export const CACHE_STORES = {
  REDIS: 'redis',
  AZURE_REDIS: 'azure-redis',
  AWS_ELASTIC_CACHE: 'aws-elastic-cache',
};

export const REDIS_MODES = {
  STANDALONE: 'standalone',
  CLUSTER: 'cluster',
};

export const AZURE_REDIS_RESOURCE = 'https://redis.azure.com/';
export const AZURE_REDIS_SCOPE = 'https://redis.azure.com/.default';

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
    redisPassword: redisDetails.password,
    redisUsername: redisDetails.username,
    redisHost: redisDetails.host,
    redisPort: redisDetails.port,
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
      if (redisUsername || redisPassword) {
        const finalUsername = encodeURIComponent(
          decodeURIComponent(redisUsername || '')
        );
        const finalPassword = encodeURIComponent(
          decodeURIComponent(redisPassword || '')
        );
        return `redis://${finalUsername || ''}:${finalPassword || ''}@${existingHost}:${finalPort}`;
      }
      return `redis://${existingHost}:${finalPort}`;
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
