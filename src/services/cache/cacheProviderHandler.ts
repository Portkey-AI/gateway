import {
  ICacheProvider,
  ISetOperations,
  IAtomicOperations,
  CacheOptions,
  CacheCapabilities,
  RateLimitResult,
  CircuitBreakerData,
  ThresholdConfig,
  ThresholdIncrementResult,
  hasSetOperations,
  hasAtomicOperations,
  hasScriptOperations,
  hasReadReplicaSupport,
  hasRateLimiterOperations,
  hasCircuitBreakerOperations,
} from './types';
import {
  EmulatedSetOperations,
  EmulatedAtomicOperations,
} from './utils/emulated';

export class CacheProviderHandler {
  private provider: ICacheProvider;
  private setOps: ISetOperations;
  private atomicOps: IAtomicOperations;

  constructor(provider: ICacheProvider) {
    this.provider = provider;

    // Use native ops if available, otherwise use emulated
    this.setOps = hasSetOperations(provider)
      ? provider
      : new EmulatedSetOperations(provider);

    this.atomicOps = hasAtomicOperations(provider)
      ? provider
      : new EmulatedAtomicOperations(provider);
  }

  get capabilities(): CacheCapabilities {
    return this.provider.capabilities;
  }

  get supportsScripts(): boolean {
    return this.provider.capabilities.supportsLuaScripts;
  }

  get supportsNativeSets(): boolean {
    return this.provider.capabilities.supportsSets;
  }

  get supportsAtomicOps(): boolean {
    return this.provider.capabilities.supportsAtomicOps;
  }

  get supportsRateLimiter(): boolean {
    return (
      this.provider.capabilities.supportsLuaScripts ||
      hasRateLimiterOperations(this.provider)
    );
  }

  get supportsCircuitBreaker(): boolean {
    return (
      this.provider.capabilities.supportsLuaScripts ||
      hasCircuitBreakerOperations(this.provider)
    );
  }

  async get<T = unknown>(
    key: string,
    options?: CacheOptions
  ): Promise<T | null> {
    return this.provider.get<T>(key, options);
  }

  async set(
    key: string,
    value: unknown,
    options?: CacheOptions
  ): Promise<boolean> {
    return this.provider.set(key, value, options);
  }

  async delete(key: string | string[], namespace?: string): Promise<boolean> {
    return this.provider.delete(key, namespace);
  }

  async exists(key: string, namespace?: string): Promise<boolean> {
    return this.provider.exists(key, namespace);
  }

  async addToSet(key: string, ...members: string[]): Promise<number> {
    return this.setOps.addToSet(key, members);
  }

  async removeFromSet(key: string, ...members: string[]): Promise<number> {
    return this.setOps.removeFromSet(key, members);
  }

  async getSetMembers(
    key: string,
    useMemCache = false,
    memCacheExpiry?: number
  ): Promise<Set<string>> {
    // Pass local cache options to the provider - it handles caching internally
    // using the same key (since NodeCache is separate from Redis)
    return this.setOps.getSetMembers(key, undefined, {
      useLocalCache: useMemCache,
      localCacheTtl: memCacheExpiry,
    });
  }

  async isSetMember(key: string, member: string): Promise<boolean> {
    return this.setOps.isSetMember(key, member);
  }

  async increment(key: string, amount = 1): Promise<number> {
    return this.atomicOps.increment(key, amount);
  }

  async decrement(key: string, amount = 1): Promise<number> {
    return this.atomicOps.decrement(key, amount);
  }

  async getNumber(key: string): Promise<number> {
    return this.atomicOps.getAtomicValue(key);
  }

  /**
   * Increment with threshold checking - used for usage limits
   * Returns threshold status along with new value to trigger resync when thresholds are crossed
   * Falls back to regular increment if the underlying provider doesn't support it
   */
  async incrementWithThreshold(
    key: string,
    amount: number,
    thresholds: ThresholdConfig
  ): Promise<ThresholdIncrementResult> {
    // Check if the atomic ops provider supports threshold increment
    if (this.atomicOps.incrementWithThreshold) {
      return this.atomicOps.incrementWithThreshold(key, amount, thresholds);
    }
    // Fall back to regular increment without threshold checking
    const value = await this.atomicOps.increment(key, amount);
    return {
      value,
      thresholdCrossed: false,
      exhausted: false,
      alertThresholdCrossed: false,
    };
  }

  async batchIncrement(increments: Map<string, number>): Promise<void> {
    const promises: Promise<number>[] = [];

    for (const [key, amount] of increments.entries()) {
      if (amount !== 0) {
        promises.push(this.atomicOps.increment(key, amount));
      }
    }

    await Promise.all(promises);
  }

  async executeScript<T = unknown>(
    script: string,
    keys: string[],
    args: string[]
  ): Promise<T> {
    if (!hasScriptOperations(this.provider)) {
      throw new Error('Lua scripts not supported by current cache backend');
    }
    return this.provider.executeScript<T>(script, keys, args);
  }

  async loadScript(script: string): Promise<string> {
    if (!hasScriptOperations(this.provider)) {
      throw new Error('Lua scripts not supported by current cache backend');
    }
    return this.provider.loadScript(script);
  }

  async getFromReplica<T = unknown>(key: string): Promise<T | null> {
    if (hasReadReplicaSupport(this.provider)) {
      return this.provider.getFromReplica<T>(key);
    }
    // Fall back to regular get
    return this.provider.get<T>(key);
  }

  // Rate Limiter Operations
  async checkRateLimit(
    key: string,
    capacity: number,
    windowSize: number,
    units: number,
    consume = true
  ): Promise<RateLimitResult> {
    if (hasRateLimiterOperations(this.provider)) {
      return this.provider.checkRateLimit(
        key,
        capacity,
        windowSize,
        units,
        consume
      );
    }
    throw new Error('Rate limiter not supported by current cache backend');
  }

  // Circuit Breaker Operations
  async recordCircuitBreakerFailure(
    configId: string,
    path: string,
    timestamp: number
  ): Promise<number> {
    if (hasCircuitBreakerOperations(this.provider)) {
      return this.provider.recordFailure(configId, path, timestamp);
    }
    throw new Error('Circuit breaker not supported by current cache backend');
  }

  async recordCircuitBreakerSuccess(
    configId: string,
    path: string
  ): Promise<number> {
    if (hasCircuitBreakerOperations(this.provider)) {
      return this.provider.recordSuccess(configId, path);
    }
    throw new Error('Circuit breaker not supported by current cache backend');
  }

  async getCircuitBreakerStatus(
    configId: string
  ): Promise<CircuitBreakerData | null> {
    if (hasCircuitBreakerOperations(this.provider)) {
      return this.provider.getStatus(configId);
    }
    throw new Error('Circuit breaker not supported by current cache backend');
  }

  async resetCircuitBreaker(configId: string): Promise<void> {
    if (hasCircuitBreakerOperations(this.provider)) {
      return this.provider.resetCircuitBreaker(configId);
    }
    throw new Error('Circuit breaker not supported by current cache backend');
  }
}
