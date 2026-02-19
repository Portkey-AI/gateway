import {
  ICacheProvider,
  IAtomicOperations,
  ISetOperations,
  IRateLimiterOperations,
  ICircuitBreakerOperations,
  CacheCapabilities,
  CacheOptions,
  CacheConfig,
  RateLimitResult,
  CircuitBreakerData,
  DurableObjectBindings,
  KVNamespace,
  ThresholdConfig,
  ThresholdIncrementResult,
} from '../types';
import { logger } from '../../../apm';

export class CloudflareCacheProvider
  implements
    ICacheProvider,
    IAtomicOperations,
    ISetOperations,
    IRateLimiterOperations,
    ICircuitBreakerOperations
{
  private kv: KVNamespace;
  private bindings?: DurableObjectBindings;
  private localCache: Map<string, { value: string; expires: number }> =
    new Map();
  private localCacheTtl: number;
  private defaultNamespace?: string;

  readonly capabilities: CacheCapabilities;

  /**
   * Get the namespaced key for a given key and optional namespace.
   * If namespace is provided, it takes precedence.
   * If no namespace provided but defaultNamespace is set, use that.
   * Otherwise, return the key as-is for backward compatibility.
   */
  private getNamespacedKey(key: string, namespace?: string): string {
    const ns = namespace ?? this.defaultNamespace;
    return ns ? `${ns}:${key}` : key;
  }

  constructor(
    kvNamespace: KVNamespace,
    bindings?: DurableObjectBindings,
    config?: Partial<CacheConfig> & { defaultNamespace?: string }
  ) {
    this.kv = kvNamespace;
    this.bindings = bindings;
    this.localCacheTtl = (config?.localCacheTtl ?? 30) * 1000;
    this.defaultNamespace = config?.defaultNamespace;

    // Capabilities depend on whether DO bindings are available
    this.capabilities = {
      supportsAtomicOps: !!bindings?.ATOMIC_COUNTER,
      supportsSets: false, // Always emulated
      supportsLuaScripts: false,
      supportsReadReplicas: false,
      maxTtl: 31536000, // 1 year max for CF KV
      maxValueSize: 25 * 1024 * 1024, // 25MB
    };
  }

  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    const namespacedKey = this.getNamespacedKey(key, options?.namespace);
    try {
      if (options?.useLocalCache) {
        const cached = this.localCache.get(namespacedKey);
        if (cached && cached.expires > Date.now()) {
          return JSON.parse(cached.value) as T;
        }
        if (cached) {
          this.localCache.delete(namespacedKey);
        }
      }

      const value = await this.kv.get(namespacedKey);
      if (value === null) return null;

      if (options?.useLocalCache) {
        const ttlMs = (options.localCacheTtl ?? 30) * 1000;
        this.localCache.set(namespacedKey, {
          value,
          expires: Date.now() + ttlMs,
        });
      }

      return JSON.parse(value) as T;
    } catch (err: any) {
      logger.error({
        message: `CloudflareCacheProvider.get error: ${err.message}`,
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
      await this.kv.put(namespacedKey, serialized, {
        expirationTtl: options?.ttl,
      });
      this.localCache.delete(namespacedKey);
      return true;
    } catch (err: any) {
      logger.error({
        message: `CloudflareCacheProvider.set error: ${err.message}`,
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
      await Promise.all(
        namespacedKeys.map((k) => {
          this.localCache.delete(k);
          return this.kv.delete(k);
        })
      );
      return true;
    } catch (err: any) {
      logger.error({
        message: `CloudflareCacheProvider.delete error: ${err.message}`,
      });
      return false;
    }
  }

  async exists(key: string, namespace?: string): Promise<boolean> {
    const namespacedKey = this.getNamespacedKey(key, namespace);
    try {
      return (await this.kv.get(namespacedKey)) !== null;
    } catch (err: any) {
      logger.error({
        message: `CloudflareCacheProvider.exists error: ${err.message}`,
        key: namespacedKey,
      });
      return false;
    }
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async disconnect(): Promise<void> {
    this.localCache.clear();
  }

  async addToSet(
    key: string,
    members: string[],
    namespace?: string
  ): Promise<number> {
    if (members.length === 0) return 0;

    const existing = await this.getSetMembers(key, namespace);
    const sizeBefore = existing.size;
    members.forEach((m) => existing.add(m));

    await this.set(key, Array.from(existing), { namespace });
    return existing.size - sizeBefore;
  }

  async removeFromSet(
    key: string,
    members: string[],
    namespace?: string
  ): Promise<number> {
    if (members.length === 0) return 0;

    const existing = await this.getSetMembers(key, namespace);
    const sizeBefore = existing.size;
    members.forEach((m) => existing.delete(m));

    await this.set(key, Array.from(existing), { namespace });
    return sizeBefore - existing.size;
  }

  async getSetMembers(key: string, namespace?: string): Promise<Set<string>> {
    const value = await this.get<string[]>(key, { namespace });
    return new Set(value ?? []);
  }

  async isSetMember(
    key: string,
    member: string,
    namespace?: string
  ): Promise<boolean> {
    const members = await this.getSetMembers(key, namespace);
    return members.has(member);
  }

  async increment(
    key: string,
    amount = 1,
    namespace?: string
  ): Promise<number> {
    const namespacedKey = this.getNamespacedKey(key, namespace);
    if (this.bindings?.ATOMIC_COUNTER) {
      return this.doIncrement(namespacedKey, amount);
    }
    return this.emulatedIncrement(namespacedKey, amount);
  }

  async decrement(
    key: string,
    amount = 1,
    namespace?: string
  ): Promise<number> {
    return this.increment(key, -amount, namespace);
  }

  async getAtomicValue(key: string, namespace?: string): Promise<number> {
    const namespacedKey = this.getNamespacedKey(key, namespace);
    if (this.bindings?.ATOMIC_COUNTER) {
      return this.doGetNumber(namespacedKey);
    }
    const value = await this.get<number>(key, { namespace });
    return value ?? 0;
  }

  private async doIncrement(key: string, amount: number): Promise<number> {
    try {
      const id = this.bindings!.ATOMIC_COUNTER.idFromName(key);
      const stub = this.bindings!.ATOMIC_COUNTER.get(id);

      const response = await stub.fetch(
        new Request('https://do/increment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount }),
        })
      );

      const result = (await response.json()) as { value: number };
      return result.value;
    } catch (err: any) {
      logger.error({
        message: `CloudflareCacheProvider.doIncrement error: ${err.message}`,
        key,
      });
      return 0;
    }
  }

  /**
   * Increment with threshold checking - used for usage limits
   * Returns threshold status along with new value to trigger resync when needed
   */
  async incrementWithThreshold(
    key: string,
    amount: number,
    thresholds: ThresholdConfig,
    namespace?: string
  ): Promise<ThresholdIncrementResult> {
    const namespacedKey = this.getNamespacedKey(key, namespace);
    if (this.bindings?.ATOMIC_COUNTER) {
      return this.doIncrementWithThreshold(namespacedKey, amount, thresholds);
    }
    // Fallback: emulated increment without threshold checking
    const value = await this.emulatedIncrement(namespacedKey, amount);
    return {
      value,
      thresholdCrossed: false,
      exhausted: false,
      alertThresholdCrossed: false,
    };
  }

  private async doIncrementWithThreshold(
    key: string,
    amount: number,
    thresholds: ThresholdConfig
  ): Promise<ThresholdIncrementResult> {
    try {
      const id = this.bindings!.ATOMIC_COUNTER.idFromName(key);
      const stub = this.bindings!.ATOMIC_COUNTER.get(id);

      const response = await stub.fetch(
        new Request('https://do/increment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount,
            creditLimit: thresholds.creditLimit,
            alertThreshold: thresholds.alertThreshold,
            isThresholdAlertsSent: thresholds.isThresholdAlertsSent,
          }),
        })
      );

      const result = (await response.json()) as ThresholdIncrementResult;
      return result;
    } catch (err: any) {
      logger.error({
        message: `CloudflareCacheProvider.doIncrementWithThreshold error: ${err.message}`,
        key,
      });
      return {
        value: 0,
        thresholdCrossed: false,
        exhausted: false,
        alertThresholdCrossed: false,
      };
    }
  }

  private async doGetNumber(key: string): Promise<number> {
    try {
      const id = this.bindings!.ATOMIC_COUNTER.idFromName(key);
      const stub = this.bindings!.ATOMIC_COUNTER.get(id);

      const response = await stub.fetch(new Request('https://do/get'));
      const result = (await response.json()) as { value: number };
      return result.value;
    } catch (err: any) {
      logger.error({
        message: `CloudflareCacheProvider.doGetNumber error: ${err.message}`,
        key,
      });
      return 0;
    }
  }

  private async emulatedIncrement(
    key: string,
    amount: number
  ): Promise<number> {
    const current = (await this.get<number>(key)) ?? 0;
    const newValue = current + amount;
    await this.set(key, newValue);
    return newValue;
  }

  async checkRateLimit(
    key: string,
    capacity: number,
    windowSize: number,
    units: number,
    consume = true
  ): Promise<RateLimitResult> {
    if (!this.bindings?.RATE_LIMITER) {
      throw new Error(
        'Rate limiter not available: RATE_LIMITER binding not provided'
      );
    }

    try {
      const id = this.bindings.RATE_LIMITER.idFromName(key);
      const stub = this.bindings.RATE_LIMITER.get(id);

      const response = await stub.fetch(
        new Request('https://do/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ capacity, windowSize, units, consume }),
        })
      );

      return (await response.json()) as RateLimitResult;
    } catch (err: any) {
      logger.error({
        message: `CloudflareCacheProvider.checkRateLimit error: ${err.message}`,
        key,
      });
      return {
        allowed: true,
        waitTime: 0,
        availableTokens: capacity,
        windowStart: 0,
        windowEnd: 0,
      };
    }
  }

  async recordFailure(
    configId: string,
    path: string,
    timestamp: number
  ): Promise<number> {
    if (!this.bindings?.CIRCUIT_BREAKER) {
      throw new Error(
        'Circuit breaker not available: CIRCUIT_BREAKER binding not provided'
      );
    }

    try {
      const id = this.bindings.CIRCUIT_BREAKER.idFromName(configId);
      const stub = this.bindings.CIRCUIT_BREAKER.get(id);

      const response = await stub.fetch(
        new Request('https://do/recordFailure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, timestamp }),
        })
      );

      const result = (await response.json()) as { failure_count: number };
      return result.failure_count;
    } catch (err: any) {
      logger.error({
        message: `CloudflareCacheProvider.recordFailure error: ${err.message}`,
        configId,
        path,
      });
      return 0;
    }
  }

  async recordSuccess(configId: string, path: string): Promise<number> {
    if (!this.bindings?.CIRCUIT_BREAKER) {
      throw new Error(
        'Circuit breaker not available: CIRCUIT_BREAKER binding not provided'
      );
    }

    try {
      const id = this.bindings.CIRCUIT_BREAKER.idFromName(configId);
      const stub = this.bindings.CIRCUIT_BREAKER.get(id);

      const response = await stub.fetch(
        new Request('https://do/recordSuccess', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path }),
        })
      );

      const result = (await response.json()) as { success_count: number };
      return result.success_count;
    } catch (err: any) {
      logger.error({
        message: `CloudflareCacheProvider.recordSuccess error: ${err.message}`,
        configId,
        path,
      });
      return 0;
    }
  }

  async getStatus(configId: string): Promise<CircuitBreakerData | null> {
    if (!this.bindings?.CIRCUIT_BREAKER) {
      throw new Error(
        'Circuit breaker not available: CIRCUIT_BREAKER binding not provided'
      );
    }

    try {
      const id = this.bindings.CIRCUIT_BREAKER.idFromName(configId);
      const stub = this.bindings.CIRCUIT_BREAKER.get(id);

      const response = await stub.fetch(new Request('https://do/getStatus'));

      const data = (await response.json()) as CircuitBreakerData;

      // Return null if no circuit breaker data exists
      if (!data || Object.keys(data).length === 0) {
        return null;
      }

      return data;
    } catch (err: any) {
      logger.error({
        message: `CloudflareCacheProvider.getStatus error: ${err.message}`,
        configId,
      });
      return null;
    }
  }

  async resetCircuitBreaker(configId: string): Promise<void> {
    if (!this.bindings?.CIRCUIT_BREAKER) {
      throw new Error(
        'Circuit breaker not available: CIRCUIT_BREAKER binding not provided'
      );
    }

    try {
      const id = this.bindings.CIRCUIT_BREAKER.idFromName(configId);
      const stub = this.bindings.CIRCUIT_BREAKER.get(id);

      await stub.fetch(new Request('https://do/destroy', { method: 'POST' }));
    } catch (err: any) {
      logger.error({
        message: `CloudflareCacheProvider.resetCircuitBreaker error: ${err.message}`,
        configId,
      });
    }
  }

  clearLocalCache(): void {
    this.localCache.clear();
  }

  getLocalCacheSize(): number {
    return this.localCache.size;
  }

  pruneLocalCache(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.localCache.entries()) {
      if (entry.expires <= now) {
        this.localCache.delete(key);
        pruned++;
      }
    }
    return pruned;
  }
}
