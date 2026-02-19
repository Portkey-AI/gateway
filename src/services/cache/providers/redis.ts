import { Redis, Cluster } from 'ioredis';
import NodeCache from 'node-cache';
import {
  ICacheProvider,
  ISetOperations,
  IAtomicOperations,
  IScriptOperations,
  IReadReplicaSupport,
  IRateLimiterOperations,
  ICircuitBreakerOperations,
  CacheCapabilities,
  CacheOptions,
  CacheConfig,
  RateLimitResult,
  CircuitBreakerData,
} from '../types';
import { logger } from '../../../apm';

export class RedisCacheProvider
  implements
    ICacheProvider,
    ISetOperations,
    IAtomicOperations,
    IScriptOperations,
    IReadReplicaSupport,
    IRateLimiterOperations,
    ICircuitBreakerOperations
{
  private client: Redis | Cluster;
  private readerClient?: Redis | Cluster;
  private localCache: NodeCache | null;
  private scriptHashes: Map<string, string> = new Map();
  private defaultNamespace?: string;

  /**
   * Get the namespaced key for a given key and optional namespace.
   * If namespace is provided in options, it takes precedence.
   * If no namespace provided but defaultNamespace is set, use that.
   * Otherwise, return the key as-is for backward compatibility.
   */
  private getNamespacedKey(key: string, namespace?: string): string {
    const ns = namespace ?? this.defaultNamespace;
    return ns ? `${ns}:${key}` : key;
  }

  // Rate limit Lua script - fixed window algorithm
  private static RATE_LIMIT_LUA = `
local consumedKey = KEYS[1]
local windowStartKey = KEYS[2]

local capacity = tonumber(ARGV[1])
local windowSize = tonumber(ARGV[2])
local units = tonumber(ARGV[3])
local now = tonumber(ARGV[4])
local ttl = tonumber(ARGV[5])
local consume = tonumber(ARGV[6])

if units <= 0 or capacity <= 0 or windowSize <= 0 then
  return {0, -1, -1, 0, 0}
end

local consumed = tonumber(redis.call("GET", consumedKey) or "0")
local windowStart = tonumber(redis.call("GET", windowStartKey) or "0")

local currentWindowStart = math.floor(now / windowSize) * windowSize
local currentWindowEnd = currentWindowStart + windowSize

if windowStart ~= currentWindowStart then
  consumed = 0
  windowStart = currentWindowStart
end

local allowed = 0
local waitTime = 0
local availableTokens = capacity - consumed

if consumed + units <= capacity then
  allowed = 1
else
  waitTime = math.max(0, currentWindowEnd - now)
end

if consume == 1 then
  consumed = consumed + units
  availableTokens = capacity - consumed
end

redis.call("SET", consumedKey, consumed, "PX", ttl)
redis.call("SET", windowStartKey, windowStart, "PX", ttl)

return {allowed, waitTime, availableTokens, currentWindowStart, currentWindowEnd}
`;

  // Circuit breaker Lua scripts
  private static CB_RECORD_FAILURE_LUA = `
local key = KEYS[1]
local path = ARGV[1]
local timestamp = ARGV[2]

local data = redis.call('GET', key)
local cb_data = {}

if data then
  cb_data = cjson.decode(data)
end

if not cb_data[path] then
  cb_data[path] = { failure_count = 0 }
end

cb_data[path].failure_count = cb_data[path].failure_count + 1
if not cb_data[path].first_failure_time then
  cb_data[path].first_failure_time = tonumber(timestamp)
  cb_data[path].success_count = 0
end

redis.call('SETEX', key, 86400, cjson.encode(cb_data))

return cb_data[path].failure_count
`;

  private static CB_RECORD_SUCCESS_LUA = `
local key = KEYS[1]
local path = ARGV[1]

local data = redis.call('GET', key)
local cb_data = {}

if data then
  cb_data = cjson.decode(data)
end

if not cb_data[path] then
  cb_data[path] = { success_count = 0 }
end

cb_data[path].success_count = cb_data[path].success_count + 1

redis.call('SETEX', key, 86400, cjson.encode(cb_data))

return cb_data[path].success_count
`;

  readonly capabilities: CacheCapabilities = {
    supportsAtomicOps: true,
    supportsSets: true,
    supportsLuaScripts: true,
    supportsReadReplicas: true,
  };

  constructor(
    client: Redis | Cluster,
    readerClient?: Redis | Cluster,
    config?: Partial<CacheConfig> & { defaultNamespace?: string }
  ) {
    this.client = client;
    this.readerClient = readerClient;
    this.defaultNamespace = config?.defaultNamespace;
    this.localCache =
      config?.enableLocalCache !== false
        ? new NodeCache({
            stdTTL: config?.localCacheTtl ?? 30,
            checkperiod: 60,
          })
        : null;
  }
  isHealthy(): Promise<boolean> {
    throw new Error('Method not implemented.');
  }
  disconnect(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    const namespacedKey = this.getNamespacedKey(key, options?.namespace);
    try {
      // Check local cache first
      if (options?.useLocalCache && this.localCache) {
        const cached = this.localCache.get<string>(namespacedKey);
        if (cached) {
          return JSON.parse(cached) as T;
        }
      }

      const value = await this.client.get(namespacedKey);
      if (value === null) return null;

      // Populate local cache
      if (options?.useLocalCache && this.localCache) {
        this.localCache.set(namespacedKey, value, options.localCacheTtl ?? 30);
      }

      return JSON.parse(value) as T;
    } catch (err: any) {
      logger.error({
        message: `RedisCacheProvider.get error: ${err.message}`,
        key: namespacedKey,
      });
      return null;
    }
  }

  async set(
    key: string,
    value: unknown,
    options?: CacheOptions
  ): Promise<boolean> {
    const namespacedKey = this.getNamespacedKey(key, options?.namespace);
    try {
      const serialized = JSON.stringify(value);
      if (options?.ttl) {
        await this.client.set(namespacedKey, serialized, 'EX', options.ttl);
      } else {
        await this.client.set(namespacedKey, serialized);
      }
      return true;
    } catch (err: any) {
      logger.error({
        message: `RedisCacheProvider.set error: ${err.message}`,
        key: namespacedKey,
      });
      return false;
    }
  }

  async delete(key: string | string[], namespace?: string): Promise<boolean> {
    try {
      const keys = Array.isArray(key) ? key : [key];
      const namespacedKeys = keys.map((k) =>
        this.getNamespacedKey(k, namespace)
      );
      await this.client.del(...namespacedKeys);
      // Invalidate local cache
      namespacedKeys.forEach((k) => this.localCache?.del(k));
      return true;
    } catch (err: any) {
      logger.error({
        message: `RedisCacheProvider.delete error: ${err.message}`,
      });
      return false;
    }
  }

  async exists(key: string, namespace?: string): Promise<boolean> {
    const namespacedKey = this.getNamespacedKey(key, namespace);
    try {
      return (await this.client.exists(namespacedKey)) === 1;
    } catch (err: any) {
      logger.error({
        message: `RedisCacheProvider.exists error: ${err.message}`,
        key: namespacedKey,
      });
      return false;
    }
  }

  async addToSet(
    key: string,
    members: string[],
    namespace?: string
  ): Promise<number> {
    const namespacedKey = this.getNamespacedKey(key, namespace);
    try {
      if (members.length === 0) return 0;
      const result = await this.client.sadd(namespacedKey, ...members);
      // Invalidate local cache
      this.localCache?.del(namespacedKey);
      return result;
    } catch (err: any) {
      logger.error({
        message: `RedisCacheProvider.addToSet error: ${err.message}`,
        key: namespacedKey,
      });
      return 0;
    }
  }

  async removeFromSet(
    key: string,
    members: string[],
    namespace?: string
  ): Promise<number> {
    const namespacedKey = this.getNamespacedKey(key, namespace);
    try {
      if (members.length === 0) return 0;
      const result = await this.client.srem(namespacedKey, ...members);
      // Invalidate local cache
      this.localCache?.del(namespacedKey);
      return result;
    } catch (err: any) {
      logger.error({
        message: `RedisCacheProvider.removeFromSet error: ${err.message}`,
        key: namespacedKey,
      });
      return 0;
    }
  }

  async getSetMembers(
    key: string,
    namespace?: string,
    options?: { useLocalCache?: boolean; localCacheTtl?: number }
  ): Promise<Set<string>> {
    const namespacedKey = this.getNamespacedKey(key, namespace);
    try {
      // Check local cache first if enabled
      if (options?.useLocalCache && this.localCache) {
        const cached = this.localCache.get<string[]>(namespacedKey);
        if (cached && Array.isArray(cached)) {
          return new Set(cached);
        }
      }

      // Fetch from Redis SET using SMEMBERS
      const members = await this.client.smembers(namespacedKey);
      const result = new Set(members);

      // Populate local cache for future requests
      if (options?.useLocalCache && this.localCache && members.length > 0) {
        this.localCache.set(
          namespacedKey,
          members,
          options.localCacheTtl ?? 30
        );
      }

      return result;
    } catch (err: any) {
      logger.error({
        message: `RedisCacheProvider.getSetMembers error: ${err.message}`,
        key: namespacedKey,
      });
      return new Set();
    }
  }

  async isSetMember(
    key: string,
    member: string,
    namespace?: string
  ): Promise<boolean> {
    const namespacedKey = this.getNamespacedKey(key, namespace);
    try {
      return (await this.client.sismember(namespacedKey, member)) === 1;
    } catch (err: any) {
      logger.error({
        message: `RedisCacheProvider.isSetMember error: ${err.message}`,
        key: namespacedKey,
      });
      return false;
    }
  }

  async increment(
    key: string,
    amount = 1,
    namespace?: string
  ): Promise<number> {
    const namespacedKey = this.getNamespacedKey(key, namespace);
    try {
      const result = await this.client.incrbyfloat(namespacedKey, amount);
      return parseFloat(result);
    } catch (err: any) {
      logger.error({
        message: `RedisCacheProvider.increment error: ${err.message}`,
        key: namespacedKey,
      });
      return 0;
    }
  }

  async decrement(
    key: string,
    amount = 1,
    namespace?: string
  ): Promise<number> {
    const namespacedKey = this.getNamespacedKey(key, namespace);
    try {
      const result = await this.client.incrbyfloat(namespacedKey, -amount);
      return parseFloat(result);
    } catch (err: any) {
      logger.error({
        message: `RedisCacheProvider.decrement error: ${err.message}`,
        key: namespacedKey,
      });
      return 0;
    }
  }

  async getAtomicValue(key: string, namespace?: string): Promise<number> {
    const namespacedKey = this.getNamespacedKey(key, namespace);
    try {
      const value = await this.client.get(namespacedKey);
      return value ? Number(value) : 0;
    } catch (err: any) {
      logger.error({
        message: `RedisCacheProvider.getNumber error: ${err.message}`,
        key: namespacedKey,
      });
      return 0;
    }
  }

  async loadScript(script: string): Promise<string> {
    try {
      // Check if already loaded
      const existingSha = this.scriptHashes.get(script);
      if (existingSha) return existingSha;

      const sha = (await this.client.script('LOAD', script)) as string;
      this.scriptHashes.set(script, sha);
      return sha;
    } catch (err: any) {
      logger.error({
        message: `RedisCacheProvider.loadScript error: ${err.message}`,
      });
      throw err;
    }
  }

  async executeScript<T>(
    scriptOrSha: string,
    keys: string[],
    args: string[]
  ): Promise<T> {
    try {
      // Check if it's a known script (by content)
      let sha = this.scriptHashes.get(scriptOrSha);

      if (sha) {
        // Execute by SHA
        return (await this.client.evalsha(
          sha,
          keys.length,
          ...keys,
          ...args
        )) as T;
      }

      // Try as SHA first
      try {
        return (await this.client.evalsha(
          scriptOrSha,
          keys.length,
          ...keys,
          ...args
        )) as T;
      } catch (error: any) {
        if (error.message?.includes('NOSCRIPT')) {
          // It's a script content, load and execute
          sha = await this.loadScript(scriptOrSha);
          return (await this.client.evalsha(
            sha,
            keys.length,
            ...keys,
            ...args
          )) as T;
        }
        throw error;
      }
    } catch (err: any) {
      logger.error({
        message: `RedisCacheProvider.executeScript error: ${err.message}`,
      });
      throw err;
    }
  }

  async getFromReplica<T>(key: string, namespace?: string): Promise<T | null> {
    const namespacedKey = this.getNamespacedKey(key, namespace);
    try {
      const client = this.readerClient ?? this.client;
      const value = await client.get(namespacedKey);
      return value ? (JSON.parse(value) as T) : null;
    } catch (err: any) {
      logger.error({
        message: `RedisCacheProvider.getFromReplica error: ${err.message}`,
        key: namespacedKey,
      });
      return null;
    }
  }

  async checkRateLimit(
    key: string,
    capacity: number,
    windowSize: number,
    units: number,
    consume = true
  ): Promise<RateLimitResult> {
    try {
      const tag = `{rate:${key}}`;
      const consumedKey = `${tag}:consumed`;
      const windowStartKey = `${tag}:windowStart`;
      const now = Date.now();
      const ttl = windowSize * 3; // TTL factor

      const result = await this.executeScript<number[]>(
        RedisCacheProvider.RATE_LIMIT_LUA,
        [consumedKey, windowStartKey],
        [
          capacity.toString(),
          windowSize.toString(),
          units.toString(),
          now.toString(),
          ttl.toString(),
          consume ? '1' : '0',
        ]
      );

      const [allowed, waitTime, availableTokens, windowStart, windowEnd] =
        result;
      return {
        allowed: allowed === 1,
        waitTime: Number(waitTime),
        availableTokens: Number(availableTokens),
        windowStart: Number(windowStart),
        windowEnd: Number(windowEnd),
      };
    } catch (err: any) {
      logger.error({
        message: `RedisCacheProvider.checkRateLimit error: ${err.message}`,
        key,
      });
      // Fail open - allow request on error
      return {
        allowed: true,
        waitTime: 0,
        availableTokens: capacity,
        windowStart: 0,
        windowEnd: 0,
      };
    }
  }

  // Circuit Breaker Operations
  private generateCircuitBreakerKey(configId: string): string {
    return `{circuit_breaker:${configId}}`;
  }

  async recordFailure(
    configId: string,
    path: string,
    timestamp: number
  ): Promise<number> {
    try {
      const key = this.generateCircuitBreakerKey(configId);
      const result = await this.executeScript<number>(
        RedisCacheProvider.CB_RECORD_FAILURE_LUA,
        [key],
        [path, timestamp.toString()]
      );
      return result;
    } catch (err: any) {
      logger.error({
        message: `RedisCacheProvider.recordFailure error: ${err.message}`,
        configId,
        path,
      });
      return 0;
    }
  }

  async recordSuccess(configId: string, path: string): Promise<number> {
    try {
      const key = this.generateCircuitBreakerKey(configId);
      const result = await this.executeScript<number>(
        RedisCacheProvider.CB_RECORD_SUCCESS_LUA,
        [key],
        [path]
      );
      return result;
    } catch (err: any) {
      logger.error({
        message: `RedisCacheProvider.recordSuccess error: ${err.message}`,
        configId,
        path,
      });
      return 0;
    }
  }

  async getStatus(configId: string): Promise<CircuitBreakerData | null> {
    try {
      const key = this.generateCircuitBreakerKey(configId);
      const data = await this.client.get(key);
      if (!data) return null;
      return JSON.parse(data) as CircuitBreakerData;
    } catch (err: any) {
      logger.error({
        message: `RedisCacheProvider.getStatus error: ${err.message}`,
        configId,
      });
      return null;
    }
  }

  async resetCircuitBreaker(configId: string): Promise<void> {
    try {
      const key = this.generateCircuitBreakerKey(configId);
      await this.client.del(key);
    } catch (err: any) {
      logger.error({
        message: `RedisCacheProvider.resetCircuitBreaker error: ${err.message}`,
        configId,
      });
    }
  }

  getClient(): Redis | Cluster {
    return this.client;
  }

  invalidateLocalCache(key: string | string[], namespace?: string): void {
    const keys = Array.isArray(key) ? key : [key];
    const namespacedKeys = keys.map((k) => this.getNamespacedKey(k, namespace));
    namespacedKeys.forEach((k) => this.localCache?.del(k));
  }

  clearLocalCache(): void {
    this.localCache?.flushAll();
  }
}
