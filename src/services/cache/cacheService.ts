import { getRuntimeKey } from 'hono/adapter';
import { CacheProviderHandler } from './cacheProviderHandler';
import { RedisCacheProvider } from './providers/redis';
import { CloudflareCacheProvider } from './providers/cloudflare';
import { InMemoryCacheProvider } from './providers/memory';
import { CloudflareEnv, RuntimeType } from './types';
import { redisClient, redisReaderClient } from '../../data-stores/redis';
import {
  CACHE_STORES,
  shouldUseMemoryCache,
  hasRedisConfig,
} from '../../data-stores/redis/config';
import { Environment } from '../../utils/env';
import { logger } from '../../apm';

let nodeCacheService: CacheProviderHandler | null = null;

let detectedRuntime: RuntimeType | null = null;

function getRuntime(): RuntimeType {
  if (detectedRuntime === null) {
    const key = getRuntimeKey();
    detectedRuntime = key === 'workerd' ? 'workerd' : 'node';
  }
  return detectedRuntime;
}

export function isNodeRuntime(): boolean {
  return getRuntime() === 'node';
}

export function isWorkerdRuntime(): boolean {
  return getRuntime() === 'workerd';
}

export function requestCache(
  cfEnv?: Record<string, any>
): CacheProviderHandler {
  const runtime = getRuntime();

  if (runtime === 'node') {
    return getNodeCache();
  }

  if (!cfEnv) {
    throw new Error(
      'requestCache requires Hono Context in Cloudflare Workers environment'
    );
  }

  return createWorkerdCache(cfEnv as CloudflareEnv);
}

function getNodeCache(): CacheProviderHandler {
  if (!nodeCacheService) {
    const cacheStore = Environment({}).CACHE_STORE;
    const useMemory = shouldUseMemoryCache();

    if (useMemory) {
      const provider = new InMemoryCacheProvider({
        defaultTtl: 0,
        checkPeriod: 60,
      });

      nodeCacheService = new CacheProviderHandler(provider);

      if (!hasRedisConfig() && cacheStore !== CACHE_STORES.MEMORY) {
        logger.info({
          message:
            'No Redis configuration found, defaulting to in-memory cache',
          runtime: 'node',
          backend: 'memory',
          capabilities: provider.capabilities,
        });
      } else {
        logger.info({
          message: 'Cache service initialized',
          runtime: 'node',
          backend: 'memory',
          capabilities: provider.capabilities,
        });
      }
    } else {
      // Use Redis when config is available
      if (!redisClient) {
        throw new Error(
          'Redis client not initialized. Ensure data-stores/redis is imported first.'
        );
      }

      const provider = new RedisCacheProvider(redisClient, redisReaderClient, {
        enableLocalCache: true,
        localCacheTtl: 30,
      });

      nodeCacheService = new CacheProviderHandler(provider);

      logger.info({
        message: 'Cache service initialized',
        runtime: 'node',
        backend: 'redis',
        capabilities: provider.capabilities,
      });
    }
  }

  return nodeCacheService;
}

function createWorkerdCache(cfEnv: CloudflareEnv): CacheProviderHandler {
  if (!cfEnv.CACHE_KV) {
    throw new Error('CACHE_KV binding not found in environment');
  }

  // Create unified provider with optional DO bindings
  const doBindings =
    cfEnv.RATE_LIMITER && cfEnv.CIRCUIT_BREAKER && cfEnv.ATOMIC_COUNTER
      ? {
          RATE_LIMITER: cfEnv.RATE_LIMITER,
          CIRCUIT_BREAKER: cfEnv.CIRCUIT_BREAKER,
          ATOMIC_COUNTER: cfEnv.ATOMIC_COUNTER,
        }
      : undefined;

  const provider = new CloudflareCacheProvider(cfEnv.CACHE_KV, doBindings);
  return new CacheProviderHandler(provider);
}

export function getRuntimeCapabilities(): {
  supportsNativeLuaScripts: boolean;
  supportsNativeAtomicOps: boolean;
  supportsNativeSets: boolean;
  supportsReadReplicas: boolean;
  requiresRequestContext: boolean;
} {
  const runtime = getRuntime();

  if (runtime === 'node') {
    if (shouldUseMemoryCache()) {
      return {
        supportsNativeLuaScripts: false,
        supportsNativeAtomicOps: true,
        supportsNativeSets: true,
        supportsReadReplicas: false,
        requiresRequestContext: false,
      };
    }

    // Redis capabilities
    return {
      supportsNativeLuaScripts: true,
      supportsNativeAtomicOps: true,
      supportsNativeSets: true,
      supportsReadReplicas: true,
      requiresRequestContext: false,
    };
  }

  return {
    supportsNativeLuaScripts: false,
    supportsNativeAtomicOps: false, // Emulated via DOs
    supportsNativeSets: false, // Emulated via KV
    supportsReadReplicas: false,
    requiresRequestContext: true,
  };
}

export function isNodeCacheReady(): boolean {
  return nodeCacheService !== null;
}
