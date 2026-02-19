export interface CacheOptions {
  /** TTL in seconds */
  ttl?: number;
  /** Whether to use local in-memory cache for reads */
  useLocalCache?: boolean;
  /** TTL for local cache in seconds */
  localCacheTtl?: number;
  /** Optional namespace for key organization */
  namespace?: string;
}

export interface CacheCapabilities {
  /** Supports atomic increment/decrement operations */
  supportsAtomicOps: boolean;
  /** Supports native set operations (SADD, SREM, SMEMBERS) */
  supportsSets: boolean;
  /** Supports Lua script execution */
  supportsLuaScripts: boolean;
  /** Supports read replicas */
  supportsReadReplicas: boolean;
  /** Maximum TTL in seconds (undefined = unlimited) */
  maxTtl?: number;
  /** Maximum value size in bytes (undefined = unlimited) */
  maxValueSize?: number;
}

export interface ICacheProvider {
  /** Capabilities of this cache provider */
  readonly capabilities: CacheCapabilities;

  // Basic KV operations
  get<T = unknown>(key: string, options?: CacheOptions): Promise<T | null>;
  set(key: string, value: unknown, options?: CacheOptions): Promise<boolean>;
  delete(key: string | string[], namespace?: string): Promise<boolean>;
  exists(key: string, namespace?: string): Promise<boolean>;

  // Connection management
  isHealthy(): Promise<boolean>;
  disconnect(): Promise<void>;
}

export interface SetMembersCacheOptions {
  /** Whether to use local in-memory cache for reads */
  useLocalCache?: boolean;
  /** TTL for local cache in seconds */
  localCacheTtl?: number;
}

export interface ISetOperations {
  addToSet(key: string, members: string[], namespace?: string): Promise<number>;
  removeFromSet(
    key: string,
    members: string[],
    namespace?: string
  ): Promise<number>;
  getSetMembers(
    key: string,
    namespace?: string,
    options?: SetMembersCacheOptions
  ): Promise<Set<string>>;
  isSetMember(
    key: string,
    member: string,
    namespace?: string
  ): Promise<boolean>;
}

export interface ThresholdConfig {
  creditLimit?: number | null;
  alertThreshold?: number | null;
  isThresholdAlertsSent?: boolean | null;
}

export interface ThresholdIncrementResult {
  value: number;
  thresholdCrossed: boolean;
  exhausted: boolean;
  alertThresholdCrossed: boolean;
}

export interface IAtomicOperations {
  increment(key: string, amount?: number, namespace?: string): Promise<number>;
  decrement(key: string, amount?: number, namespace?: string): Promise<number>;
  getAtomicValue(key: string, namespace?: string): Promise<number>;
  /**
   * Increment with threshold checking - returns threshold status along with new value
   * Used for usage limits to trigger resync when thresholds are crossed
   */
  incrementWithThreshold?(
    key: string,
    amount: number,
    thresholds: ThresholdConfig,
    namespace?: string
  ): Promise<ThresholdIncrementResult>;
}

export interface IScriptOperations {
  loadScript(script: string): Promise<string>;
  executeScript<T = unknown>(
    scriptOrSha: string,
    keys: string[],
    args: string[]
  ): Promise<T>;
}

export interface IReadReplicaSupport {
  getFromReplica<T = unknown>(
    key: string,
    namespace?: string
  ): Promise<T | null>;
}

export type IRedisCache = ICacheProvider &
  ISetOperations &
  IAtomicOperations &
  IScriptOperations &
  IReadReplicaSupport;

export type IKVCache = ICacheProvider;

export type IAnyCache = ICacheProvider &
  Partial<ISetOperations> &
  Partial<IAtomicOperations> &
  Partial<IScriptOperations> &
  Partial<IReadReplicaSupport>;

export type CacheBackendType = 'redis' | 'cloudflare-kv' | 'memory';

export interface CacheConfig {
  backend: CacheBackendType;

  // Redis-specific
  redisUrl?: string;
  redisMode?: 'standalone' | 'cluster';
  redisTls?: boolean;
  redisPassword?: string;
  redisUsername?: string;

  // Cloudflare KV-specific
  kvNamespace?: unknown;

  // Cloudflare Durable Objects bindings
  durableObjectBindings?: DurableObjectBindings;

  // Common options
  enableLocalCache?: boolean;
  localCacheTtl?: number;
}

// Durable Object types
export interface DurableObjectId {
  toString(): string;
}

export interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}

export interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

export interface DurableObjectBindings {
  RATE_LIMITER: DurableObjectNamespace;
  CIRCUIT_BREAKER: DurableObjectNamespace;
  ATOMIC_COUNTER: DurableObjectNamespace;
}

// Rate Limiter types
export interface RateLimitResult {
  allowed: boolean;
  waitTime: number;
  availableTokens: number;
  windowStart: number;
  windowEnd: number;
}

export interface IRateLimiterOperations {
  checkRateLimit(
    key: string,
    capacity: number,
    windowSize: number,
    units: number,
    consume?: boolean
  ): Promise<RateLimitResult>;
}

// Circuit Breaker types
export interface CircuitBreakerPathData {
  failure_count: number;
  success_count: number;
  first_failure_time?: number;
}

export interface CircuitBreakerData {
  [path: string]: CircuitBreakerPathData;
}

export interface ICircuitBreakerOperations {
  recordFailure(
    configId: string,
    path: string,
    timestamp: number
  ): Promise<number>;
  recordSuccess(configId: string, path: string): Promise<number>;
  getStatus(configId: string): Promise<CircuitBreakerData | null>;
  resetCircuitBreaker(configId: string): Promise<void>;
}

export function hasSetOperations(
  cache: ICacheProvider
): cache is ICacheProvider & ISetOperations {
  return cache.capabilities.supportsSets;
}

export function hasAtomicOperations(
  cache: ICacheProvider
): cache is ICacheProvider & IAtomicOperations {
  return cache.capabilities.supportsAtomicOps;
}

export function hasScriptOperations(
  cache: ICacheProvider
): cache is ICacheProvider & IScriptOperations {
  return cache.capabilities.supportsLuaScripts;
}

export function hasReadReplicaSupport(
  cache: ICacheProvider
): cache is ICacheProvider & IReadReplicaSupport {
  return cache.capabilities.supportsReadReplicas;
}

export function hasRateLimiterOperations(
  cache: ICacheProvider
): cache is ICacheProvider & IRateLimiterOperations {
  return 'checkRateLimit' in cache;
}

export function hasCircuitBreakerOperations(
  cache: ICacheProvider
): cache is ICacheProvider & ICircuitBreakerOperations {
  return 'recordFailure' in cache && 'recordSuccess' in cache;
}

export type RuntimeType = 'node' | 'workerd';

export interface KVNamespace {
  get(
    key: string,
    options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream' }
  ): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number; expiration?: number }
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{
    keys: Array<{ name: string }>;
    list_complete: boolean;
    cursor?: string;
  }>;
}

export interface CloudflareEnv {
  /** KV namespace for cache storage */
  CACHE_KV: KVNamespace;
  /** Rate limiter Durable Object binding */
  RATE_LIMITER?: DurableObjectNamespace;
  /** Circuit breaker Durable Object binding */
  CIRCUIT_BREAKER?: DurableObjectNamespace;
  /** Atomic counter Durable Object binding */
  ATOMIC_COUNTER?: DurableObjectNamespace;
}

export interface CacheContext {
  /** Detected runtime type */
  runtime: RuntimeType;
  /** Cloudflare environment bindings (workerd only) */
  env?: CloudflareEnv;
  /** Execution context for waitUntil etc (workerd only) */
  executionCtx?: ExecutionContext;
}
