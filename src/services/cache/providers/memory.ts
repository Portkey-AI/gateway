import NodeCache from 'node-cache';
import {
  ICacheProvider,
  ISetOperations,
  IAtomicOperations,
  IRateLimiterOperations,
  ICircuitBreakerOperations,
  CacheCapabilities,
  CacheOptions,
  RateLimitResult,
  CircuitBreakerData,
  ThresholdConfig,
  ThresholdIncrementResult,
} from '../types';
import { logger } from '../../../apm';

export interface InMemoryCacheConfig {
  /** Default TTL in seconds (0 = no expiry) */
  defaultTtl?: number;
  /** Check period for expired keys in seconds */
  checkPeriod?: number;
}

export class InMemoryCacheProvider
  implements
    ICacheProvider,
    ISetOperations,
    IAtomicOperations,
    IRateLimiterOperations,
    ICircuitBreakerOperations
{
  private cache: NodeCache;

  readonly capabilities: CacheCapabilities = {
    supportsAtomicOps: true,
    supportsSets: true,
    supportsLuaScripts: false,
    supportsReadReplicas: false,
  };

  constructor(config?: InMemoryCacheConfig) {
    this.cache = new NodeCache({
      stdTTL: config?.defaultTtl ?? 0,
      checkperiod: config?.checkPeriod ?? 60,
      useClones: false,
    });
  }

  /**
   * Get the namespaced key for a given key and optional namespace.
   * If namespace is provided, prefix the key with it.
   * Otherwise, return the key as-is for backward compatibility.
   */
  private getNamespacedKey(key: string, namespace?: string): string {
    return namespace ? `${namespace}:${key}` : key;
  }

  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    const namespacedKey = this.getNamespacedKey(key, options?.namespace);
    try {
      const value = this.cache.get<T>(namespacedKey);
      return value !== undefined ? value : null;
    } catch (err: any) {
      logger.error({
        message: `InMemoryCacheProvider.get error: ${err.message}`,
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
      if (options?.ttl) {
        return this.cache.set(namespacedKey, value, options.ttl);
      }
      return this.cache.set(namespacedKey, value);
    } catch (err: any) {
      logger.error({
        message: `InMemoryCacheProvider.set error: ${err.message}`,
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
      this.cache.del(namespacedKeys);
      return true;
    } catch (err: any) {
      logger.error({
        message: `InMemoryCacheProvider.delete error: ${err.message}`,
      });
      return false;
    }
  }

  async exists(key: string, namespace?: string): Promise<boolean> {
    const namespacedKey = this.getNamespacedKey(key, namespace);
    try {
      return this.cache.has(namespacedKey);
    } catch (err: any) {
      logger.error({
        message: `InMemoryCacheProvider.exists error: ${err.message}`,
        key: namespacedKey,
      });
      return false;
    }
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async disconnect(): Promise<void> {
    this.cache.flushAll();
    this.cache.close();
  }

  async addToSet(
    key: string,
    members: string[],
    namespace?: string
  ): Promise<number> {
    const namespacedKey = this.getNamespacedKey(key, namespace);
    try {
      if (members.length === 0) return 0;

      // Get or create the Set - store Set objects directly to avoid race conditions
      let existing = this.cache.get<Set<string>>(namespacedKey);
      if (!existing) {
        existing = new Set<string>();
        this.cache.set(namespacedKey, existing);
      }

      const sizeBefore = existing.size;
      members.forEach((m) => existing!.add(m));
      // No need to set again - we mutated the reference directly

      return existing.size - sizeBefore;
    } catch (err: any) {
      logger.error({
        message: `InMemoryCacheProvider.addToSet error: ${err.message}`,
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

      // Get the Set - if it doesn't exist, nothing to remove
      const existing = this.cache.get<Set<string>>(namespacedKey);
      if (!existing) {
        return 0;
      }

      const sizeBefore = existing.size;
      members.forEach((m) => existing.delete(m));
      // No need to set again - we mutated the reference directly

      return sizeBefore - existing.size;
    } catch (err: any) {
      logger.error({
        message: `InMemoryCacheProvider.removeFromSet error: ${err.message}`,
        key: namespacedKey,
      });
      return 0;
    }
  }

  async getSetMembers(
    key: string,
    namespace?: string,
    _options?: { useLocalCache?: boolean; localCacheTtl?: number }
  ): Promise<Set<string>> {
    const namespacedKey = this.getNamespacedKey(key, namespace);
    try {
      // For in-memory provider, everything is already in memory, so local cache options are no-op
      const value = this.cache.get<Set<string>>(namespacedKey);
      // Return a copy to prevent external mutation of the internal Set
      return new Set(value ?? []);
    } catch (err: any) {
      logger.error({
        message: `InMemoryCacheProvider.getSetMembers error: ${err.message}`,
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
      // Direct check on the stored Set - no copy needed
      const members = this.cache.get<Set<string>>(namespacedKey);
      return members?.has(member) ?? false;
    } catch (err: any) {
      logger.error({
        message: `InMemoryCacheProvider.isSetMember error: ${err.message}`,
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
      const current = await this.getAtomicValue(key, namespace);
      const newValue = current + amount;
      this.cache.set(namespacedKey, newValue);
      return newValue;
    } catch (err: any) {
      logger.error({
        message: `InMemoryCacheProvider.increment error: ${err.message}`,
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
    return this.increment(key, -amount, namespace);
  }

  async getAtomicValue(key: string, namespace?: string): Promise<number> {
    const namespacedKey = this.getNamespacedKey(key, namespace);
    try {
      const value = this.cache.get<number>(namespacedKey);
      return value ?? 0;
    } catch (err: any) {
      logger.error({
        message: `InMemoryCacheProvider.getAtomicValue error: ${err.message}`,
        key: namespacedKey,
      });
      return 0;
    }
  }

  async incrementWithThreshold(
    key: string,
    amount: number,
    thresholds: ThresholdConfig,
    namespace?: string
  ): Promise<ThresholdIncrementResult> {
    try {
      const oldValue = await this.getAtomicValue(key, namespace);
      const newValue = await this.increment(key, amount, namespace);

      const { creditLimit, alertThreshold, isThresholdAlertsSent } = thresholds;

      // Check if credit limit threshold was crossed (oldValue < limit <= newValue)
      const thresholdCrossed =
        creditLimit != null &&
        oldValue < creditLimit &&
        newValue >= creditLimit;

      // Check if exhausted (newValue >= creditLimit)
      const exhausted = creditLimit != null && newValue >= creditLimit;

      // Check if alert threshold was crossed (only if not already sent)
      const alertThresholdCrossed =
        !isThresholdAlertsSent &&
        alertThreshold != null &&
        oldValue < alertThreshold &&
        newValue >= alertThreshold;

      return {
        value: newValue,
        thresholdCrossed,
        exhausted,
        alertThresholdCrossed,
      };
    } catch (err: any) {
      logger.error({
        message: `InMemoryCacheProvider.incrementWithThreshold error: ${err.message}`,
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

  async checkRateLimit(
    key: string,
    capacity: number,
    windowSize: number,
    units: number,
    consume = true
  ): Promise<RateLimitResult> {
    try {
      // Reject invalid input
      if (units <= 0 || capacity <= 0 || windowSize <= 0) {
        return {
          allowed: false,
          waitTime: -1,
          availableTokens: -1,
          windowStart: 0,
          windowEnd: 0,
        };
      }

      const consumedKey = `{rate:${key}}:consumed`;
      const windowStartKey = `{rate:${key}}:windowStart`;
      const now = Date.now();

      // Get current state
      let consumed = this.cache.get<number>(consumedKey) ?? 0;
      let windowStart = this.cache.get<number>(windowStartKey) ?? 0;

      // Compute current fixed window start (aligned to windowSize)
      const currentWindowStart = Math.floor(now / windowSize) * windowSize;
      const currentWindowEnd = currentWindowStart + windowSize;

      // If stored windowStart is different from current, reset consumed for new window
      if (windowStart !== currentWindowStart) {
        consumed = 0;
        windowStart = currentWindowStart;
      }

      // Check if request is allowed
      let allowed = false;
      let waitTime = 0;
      let availableTokens = capacity - consumed;

      if (consumed + units <= capacity) {
        allowed = true;
      } else {
        // Not allowed; compute ms until current window ends
        waitTime = Math.max(0, currentWindowEnd - now);
      }

      // Consume tokens if requested
      if (consume) {
        consumed = consumed + units;
        availableTokens = capacity - consumed;
      }

      // Persist state with TTL (windowSize * 3 for safety margin)
      const ttlSeconds = Math.ceil((windowSize * 3) / 1000);
      this.cache.set(consumedKey, consumed, ttlSeconds);
      this.cache.set(windowStartKey, windowStart, ttlSeconds);

      return {
        allowed,
        waitTime,
        availableTokens,
        windowStart: currentWindowStart,
        windowEnd: currentWindowEnd,
      };
    } catch (err: any) {
      logger.error({
        message: `InMemoryCacheProvider.checkRateLimit error: ${err.message}`,
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
      const data = this.cache.get<CircuitBreakerData>(key) ?? {};

      if (!data[path]) {
        data[path] = { failure_count: 0, success_count: 0 };
      }

      data[path].failure_count = (data[path].failure_count || 0) + 1;
      if (!data[path].first_failure_time) {
        data[path].first_failure_time = timestamp;
        data[path].success_count = 0;
      }

      // Store with 24 hour TTL
      this.cache.set(key, data, 86400);

      return data[path].failure_count;
    } catch (err: any) {
      logger.error({
        message: `InMemoryCacheProvider.recordFailure error: ${err.message}`,
        configId,
        path,
      });
      return 0;
    }
  }

  async recordSuccess(configId: string, path: string): Promise<number> {
    try {
      const key = this.generateCircuitBreakerKey(configId);
      const data = this.cache.get<CircuitBreakerData>(key) ?? {};

      if (!data[path]) {
        data[path] = { failure_count: 0, success_count: 0 };
      }

      data[path].success_count = (data[path].success_count || 0) + 1;

      // Store with 24 hour TTL
      this.cache.set(key, data, 86400);

      return data[path].success_count;
    } catch (err: any) {
      logger.error({
        message: `InMemoryCacheProvider.recordSuccess error: ${err.message}`,
        configId,
        path,
      });
      return 0;
    }
  }

  async getStatus(configId: string): Promise<CircuitBreakerData | null> {
    try {
      const key = this.generateCircuitBreakerKey(configId);
      const data = this.cache.get<CircuitBreakerData>(key);

      if (!data || Object.keys(data).length === 0) {
        return null;
      }

      return data;
    } catch (err: any) {
      logger.error({
        message: `InMemoryCacheProvider.getStatus error: ${err.message}`,
        configId,
      });
      return null;
    }
  }

  async resetCircuitBreaker(configId: string): Promise<void> {
    try {
      const key = this.generateCircuitBreakerKey(configId);
      this.cache.del(key);
    } catch (err: any) {
      logger.error({
        message: `InMemoryCacheProvider.resetCircuitBreaker error: ${err.message}`,
        configId,
      });
    }
  }

  clearAll(): void {
    this.cache.flushAll();
  }

  getStats(): NodeCache.Stats {
    return this.cache.getStats();
  }

  getKeys(): string[] {
    return this.cache.keys();
  }
}
