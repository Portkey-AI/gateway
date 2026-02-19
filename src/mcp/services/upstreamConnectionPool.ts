/**
 * @file src/mcp/services/upstreamConnectionPool.ts
 * Upstream MCP Connection Pool
 *
 * Maintains persistent connections to upstream MCP servers to avoid
 * the latency overhead of TCP/TLS/MCP handshakes on every request.
 *
 * Key features:
 * - Pools connections by workspaceId:serverId:userId
 * - NO POOLING for anonymous users (security)
 * - Per-server pooling disable flag (security)
 * - Token expiry checking before reuse
 * - Retry mechanism for stale connections
 * - TTL-based expiration (configurable via env)
 * - Health checking with graceful reconnection
 * - Background cleanup of stale connections
 */

import { createLogger } from '../../shared/utils/logger';
import { ServerConfig } from '../types/mcp';
import { Upstream, ConnectResult } from './upstream';
import { ControlPlane } from '../middleware/controlPlane';
import { TokenInfo } from '../utils/userIdentity';

const logger = createLogger('UpstreamPool');

/**
 * Configuration for the connection pool
 */
export interface PoolConfig {
  /** Maximum idle time before connection is closed (default: 5 minutes) */
  maxIdleTimeMs: number;
  /** Maximum lifetime of a connection (default: 30 minutes) */
  maxLifetimeMs: number;
  /** Interval for cleanup of expired connections (default: 60 seconds) */
  cleanupIntervalMs: number;
  /** Maximum total connections in the pool (default: 1000) */
  maxTotalConnections: number;
  /** Buffer time before token expiry to consider it expired (default: 5 minutes) */
  tokenExpiryBufferMs: number;
  /** Enable connection pooling (can be disabled globally) */
  enabled: boolean;
}

/**
 * Load pool config from environment variables
 */
function loadPoolConfigFromEnv(): Partial<PoolConfig> {
  const env = process.env;
  return {
    maxIdleTimeMs: env.MCP_POOL_MAX_IDLE_MS
      ? parseInt(env.MCP_POOL_MAX_IDLE_MS, 10)
      : undefined,
    maxLifetimeMs: env.MCP_POOL_MAX_LIFETIME_MS
      ? parseInt(env.MCP_POOL_MAX_LIFETIME_MS, 10)
      : undefined,
    cleanupIntervalMs: env.MCP_POOL_CLEANUP_INTERVAL_MS
      ? parseInt(env.MCP_POOL_CLEANUP_INTERVAL_MS, 10)
      : undefined,
    maxTotalConnections: env.MCP_POOL_MAX_CONNECTIONS
      ? parseInt(env.MCP_POOL_MAX_CONNECTIONS, 10)
      : undefined,
    tokenExpiryBufferMs: env.MCP_POOL_TOKEN_EXPIRY_BUFFER_MS
      ? parseInt(env.MCP_POOL_TOKEN_EXPIRY_BUFFER_MS, 10)
      : undefined,
    enabled: env.MCP_POOL_ENABLED !== 'false', // Enabled by default
  };
}

const DEFAULT_POOL_CONFIG: PoolConfig = {
  maxIdleTimeMs: 5 * 60 * 1000, // 5 minutes
  maxLifetimeMs: 30 * 60 * 1000, // 30 minutes
  cleanupIntervalMs: 60 * 1000, // 60 seconds
  maxTotalConnections: 1000,
  tokenExpiryBufferMs: 5 * 60 * 1000, // 5 minutes buffer
  enabled: true,
};

/**
 * Represents a pooled upstream connection
 */
interface PooledConnection {
  upstream: Upstream;
  config: ServerConfig;
  userId: string;
  createdAt: number;
  lastActivity: number;
  healthy: boolean;
  controlPlane?: ControlPlane;
  incomingHeaders?: Record<string, string>;
  /** Token expiration time (ms since epoch) if known */
  tokenExpiresAt?: number;
  /** Token info for user identity forwarding */
  tokenInfo?: TokenInfo;
}

/**
 * Result of getting a connection from the pool
 */
export interface GetConnectionResult {
  upstream: Upstream;
  reused: boolean;
  poolKey: string;
}

/**
 * Upstream Connection Pool
 *
 * Manages a pool of MCP client connections to upstream servers.
 * Connections are keyed by workspaceId:serverId:userId to ensure
 * proper isolation between users (important for OAuth).
 *
 * ## Security Features
 * - Anonymous users are NEVER pooled to prevent state leakage
 * - Per-server `disablePooling` flag for sensitive upstreams
 * - Token expiry validation before connection reuse
 * - Automatic cleanup of stale connections
 *
 * ## Security Limitation: Token Scope Changes
 * The pool key does NOT include token scope or hash. If a user's OAuth token
 * scope changes (permissions revoked/upgraded), they may reuse a connection
 * with stale OAuth state until the connection expires or goes idle.
 *
 * Mitigations for high-security deployments:
 * 1. Set `disablePooling: true` on sensitive server configs
 * 2. Reduce `MCP_POOL_MAX_LIFETIME_MS` for faster connection turnover
 * 3. Reduce `MCP_POOL_MAX_IDLE_MS` for quicker idle eviction
 *
 * See `getPoolKey()` for detailed rationale.
 */
export class UpstreamConnectionPool {
  private connections = new Map<string, PooledConnection>();
  private config: PoolConfig;
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private isShuttingDown = false;

  /**
   * Track pending connection attempts to prevent race conditions.
   * Key: poolKey, Value: Promise that resolves to the connection result
   */
  private pendingConnections = new Map<string, Promise<GetConnectionResult>>();

  constructor(config: Partial<PoolConfig> = {}) {
    const envConfig = loadPoolConfigFromEnv();
    this.config = { ...DEFAULT_POOL_CONFIG, ...envConfig, ...config };

    if (this.config.enabled) {
      this.startCleanupTimer();
      logger.info('Upstream connection pool initialized', {
        maxIdleTimeMs: this.config.maxIdleTimeMs,
        maxLifetimeMs: this.config.maxLifetimeMs,
        maxTotalConnections: this.config.maxTotalConnections,
        tokenExpiryBufferMs: this.config.tokenExpiryBufferMs,
      });
    } else {
      logger.info('Upstream connection pool DISABLED');
    }
  }

  /**
   * Check if pooling is allowed for this request
   *
   * SECURITY: We do NOT pool connections for:
   * 1. Anonymous users (no userId) - prevents state leakage
   * 2. Servers with pooling disabled in config
   * 3. When pool is globally disabled
   */
  private isPoolingAllowed(config: ServerConfig, userId: string): boolean {
    // Global disable
    if (!this.config.enabled) {
      return false;
    }

    // SECURITY: Never pool anonymous connections
    if (!userId || userId.trim() === '') {
      logger.debug(`Pooling disabled for anonymous user on ${config.serverId}`);
      return false;
    }

    // Per-server disable flag
    if (config.disablePooling) {
      logger.debug(`Pooling disabled for server ${config.serverId} via config`);
      return false;
    }

    return true;
  }

  /**
   * Generate a unique pool key for a connection.
   * Format: workspaceId:serverId:userId
   *
   * SECURITY LIMITATION: The pool key does NOT include token scope or hash.
   * This means if a user's OAuth token scope changes (e.g., permissions are
   * revoked or upgraded), they may reuse a connection established with the
   * old token's OAuth state until:
   * - The connection expires (maxLifetimeMs, default 30 min)
   * - The connection goes idle (maxIdleTimeMs, default 5 min)
   * - The token expires (checked via tokenExpiresAt)
   *
   * For high-security deployments where immediate scope changes are critical:
   * 1. Set `disablePooling: true` on sensitive server configs
   * 2. Reduce `maxLifetimeMs` to force more frequent reconnection
   * 3. Consider implementing token hash in pool key (requires changes here)
   *
   * We intentionally don't include token hash by default because:
   * - Most OAuth flows don't change scopes mid-session
   * - Hashing adds latency to every request
   * - Token refresh (same scope) would unnecessarily invalidate connections
   */
  private getPoolKey(config: ServerConfig, userId: string): string {
    return `${config.workspaceId}:${config.serverId}:${userId}`;
  }

  /**
   * Get or create a connection to an upstream MCP server
   *
   * @param config - Server configuration
   * @param userId - User identifier (from gateway token)
   * @param controlPlane - Optional control plane for OAuth
   * @param incomingHeaders - Optional headers to forward to upstream
   * @param tokenExpiresAt - Optional token expiration time (ms since epoch)
   * @param tokenInfo - Optional token info for user identity forwarding
   * @returns Connection result with upstream client and metadata
   */
  async getConnection(
    config: ServerConfig,
    userId: string,
    controlPlane?: ControlPlane,
    incomingHeaders?: Record<string, string>,
    tokenExpiresAt?: number,
    tokenInfo?: TokenInfo
  ): Promise<GetConnectionResult> {
    // SECURITY: Check if pooling is allowed
    if (!this.isPoolingAllowed(config, userId)) {
      // Create non-pooled connection
      return this.createNonPooledConnection(
        config,
        userId,
        controlPlane,
        incomingHeaders,
        tokenInfo
      );
    }

    const poolKey = this.getPoolKey(config, userId);

    // Check for existing healthy connection
    const existing = this.connections.get(poolKey);
    if (existing && this.isConnectionValid(existing, tokenExpiresAt)) {
      existing.lastActivity = Date.now();
      // Update token expiry if a newer expiry is provided (token was refreshed)
      if (
        tokenExpiresAt &&
        (!existing.tokenExpiresAt || tokenExpiresAt > existing.tokenExpiresAt)
      ) {
        existing.tokenExpiresAt = tokenExpiresAt;
        logger.debug(`Pool hit: updated token expiry for ${poolKey}`);
      }
      logger.debug(`Pool hit: reusing connection for ${poolKey}`);
      return {
        upstream: existing.upstream,
        reused: true,
        poolKey,
      };
    }

    // Check if there's already a pending connection attempt for this key
    // This prevents race conditions where multiple concurrent requests
    // try to create connections for the same user+server
    const pending = this.pendingConnections.get(poolKey);
    if (pending) {
      logger.debug(
        `Pool pending: waiting for in-flight connection for ${poolKey}`
      );
      return pending;
    }

    // Create a new connection with race condition protection
    const connectionPromise = this.createPooledConnection(
      poolKey,
      config,
      userId,
      controlPlane,
      incomingHeaders,
      tokenExpiresAt,
      tokenInfo,
      existing
    );

    // Track this pending connection
    this.pendingConnections.set(poolKey, connectionPromise);

    try {
      const result = await connectionPromise;
      return result;
    } finally {
      // Always clean up pending tracking
      this.pendingConnections.delete(poolKey);
    }
  }

  /**
   * Create a new pooled connection (internal helper)
   * Separated to allow tracking in pendingConnections map
   */
  private async createPooledConnection(
    poolKey: string,
    config: ServerConfig,
    userId: string,
    controlPlane: ControlPlane | undefined,
    incomingHeaders: Record<string, string> | undefined,
    tokenExpiresAt: number | undefined,
    tokenInfo: TokenInfo | undefined,
    existingStale: PooledConnection | undefined
  ): Promise<GetConnectionResult> {
    // Clean up invalid existing connection
    if (existingStale) {
      logger.debug(`Pool eviction: removing stale connection for ${poolKey}`);
      await this.removeConnection(poolKey);
    }

    // Check pool size limit
    if (this.connections.size >= this.config.maxTotalConnections) {
      logger.warn(
        `Pool at capacity (${this.config.maxTotalConnections}), evicting oldest connection`
      );
      await this.evictOldestConnection();
    }

    // Create new connection
    logger.debug(`Pool miss: creating new connection for ${poolKey}`);
    const upstream = await this.createUpstream(
      config,
      userId,
      controlPlane,
      incomingHeaders,
      tokenInfo
    );

    // Store in pool
    const pooledConnection: PooledConnection = {
      upstream,
      config,
      userId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      healthy: true,
      controlPlane,
      incomingHeaders,
      tokenExpiresAt,
      tokenInfo,
    };

    this.connections.set(poolKey, pooledConnection);
    logger.info(
      `Pool add: new connection for ${poolKey} (pool size: ${this.connections.size})`
    );

    return {
      upstream,
      reused: false,
      poolKey,
    };
  }

  /**
   * Create a non-pooled connection (for anonymous users or disabled servers)
   */
  private async createNonPooledConnection(
    config: ServerConfig,
    userId: string,
    controlPlane?: ControlPlane,
    incomingHeaders?: Record<string, string>,
    tokenInfo?: TokenInfo
  ): Promise<GetConnectionResult> {
    logger.debug(`Creating non-pooled connection for ${config.serverId}`);

    const upstream = await this.createUpstream(
      config,
      userId,
      controlPlane,
      incomingHeaders,
      tokenInfo
    );

    return {
      upstream,
      reused: false,
      poolKey: '', // Empty key indicates non-pooled
    };
  }

  /**
   * Create and connect an upstream instance
   */
  private async createUpstream(
    config: ServerConfig,
    userId: string,
    controlPlane?: ControlPlane,
    incomingHeaders?: Record<string, string>,
    tokenInfo?: TokenInfo
  ): Promise<Upstream> {
    const upstream = new Upstream(
      config,
      userId,
      createLogger(`Upstream:${config.serverId.substring(0, 8)}`),
      undefined, // upstreamSessionId - will be set on connect
      controlPlane,
      incomingHeaders,
      tokenInfo
    );

    // Connect to upstream
    const connectResult = await upstream.connect();

    if (!connectResult.ok) {
      // Connection failed
      throw new Error('Failed to connect to upstream', {
        cause: connectResult,
      });
    }

    return upstream;
  }

  /**
   * Check if a pooled connection is still valid
   */
  private isConnectionValid(
    conn: PooledConnection,
    currentTokenExpiresAt?: number
  ): boolean {
    const now = Date.now();

    // Check if connection is marked unhealthy
    if (!conn.healthy) {
      return false;
    }

    // Check if connection has exceeded max lifetime
    if (now - conn.createdAt > this.config.maxLifetimeMs) {
      logger.debug(`Connection exceeded max lifetime`);
      return false;
    }

    // Check if connection has been idle too long
    if (now - conn.lastActivity > this.config.maxIdleTimeMs) {
      logger.debug(`Connection exceeded max idle time`);
      return false;
    }

    // Check if upstream is still connected
    if (!conn.upstream.connected) {
      logger.debug(`Connection upstream disconnected`);
      return false;
    }

    // Check if upstream has valid capabilities (may become undefined if connection goes stale)
    if (!conn.upstream.serverCapabilities) {
      logger.debug(`Connection upstream has no serverCapabilities`);
      return false;
    }

    // SECURITY: Check token expiry with buffer
    // Use the more recent token expiry (stored or current request)
    const tokenExpiry = currentTokenExpiresAt || conn.tokenExpiresAt;
    if (tokenExpiry) {
      const expiryWithBuffer = tokenExpiry - this.config.tokenExpiryBufferMs;
      if (now >= expiryWithBuffer) {
        logger.debug(
          `Connection token expired or expiring soon (expires: ${new Date(tokenExpiry).toISOString()})`
        );
        return false;
      }
    }

    return true;
  }

  /**
   * Mark a connection as unhealthy (will be removed on next access or cleanup)
   */
  markUnhealthy(poolKey: string): void {
    if (!poolKey) return; // Non-pooled connections have empty key

    const conn = this.connections.get(poolKey);
    if (conn) {
      conn.healthy = false;
      logger.debug(`Marked connection unhealthy: ${poolKey}`);
    }
  }

  /**
   * Remove a connection from the pool and close it
   */
  async removeConnection(poolKey: string): Promise<void> {
    if (!poolKey) return; // Non-pooled connections have empty key

    const conn = this.connections.get(poolKey);
    if (conn) {
      this.connections.delete(poolKey);
      try {
        await conn.upstream.close();
        logger.debug(`Closed and removed connection: ${poolKey}`);
      } catch (error) {
        logger.warn(`Error closing connection ${poolKey}:`, error);
      }
    }
  }

  /**
   * Remove all connections for a specific user ID
   * Used when user access is revoked or API key is deleted
   *
   * @param userId - The user ID (username for OAuth, API key ID for API keys)
   * @returns Number of connections removed
   */
  async removeByUserId(userId: string): Promise<number> {
    if (!userId) return 0;

    const keysToRemove: string[] = [];

    // Pool key format: workspaceId:serverId:userId
    for (const [key, conn] of this.connections) {
      if (conn.userId === userId) {
        keysToRemove.push(key);
      }
    }

    if (keysToRemove.length > 0) {
      logger.info(
        `Removing ${keysToRemove.length} connections for userId: ${userId}`
      );

      await Promise.allSettled(
        keysToRemove.map((key) => this.removeConnection(key))
      );
    }

    return keysToRemove.length;
  }

  /**
   * Remove all connections for a specific server
   * Used when server access rules change or server is deleted
   *
   * @param workspaceId - The workspace ID
   * @param serverId - The server ID
   * @returns Number of connections removed
   */
  async removeByServer(workspaceId: string, serverId: string): Promise<number> {
    if (!workspaceId || !serverId) return 0;

    const keysToRemove: string[] = [];
    const keyPrefix = `${workspaceId}:${serverId}:`;

    // Pool key format: workspaceId:serverId:userId
    for (const key of this.connections.keys()) {
      if (key.startsWith(keyPrefix)) {
        keysToRemove.push(key);
      }
    }

    if (keysToRemove.length > 0) {
      logger.info(
        `Removing ${keysToRemove.length} connections for server: ${workspaceId}/${serverId}`
      );

      await Promise.allSettled(
        keysToRemove.map((key) => this.removeConnection(key))
      );
    }

    return keysToRemove.length;
  }

  /**
   * Remove all connections for a specific workspace
   * Used when workspace-wide access changes occur
   *
   * @param workspaceId - The workspace ID
   * @returns Number of connections removed
   */
  async removeByWorkspace(workspaceId: string): Promise<number> {
    if (!workspaceId) return 0;

    const keysToRemove: string[] = [];

    // Pool key format: workspaceId:serverId:userId
    for (const key of this.connections.keys()) {
      if (key.startsWith(`${workspaceId}:`)) {
        keysToRemove.push(key);
      }
    }

    if (keysToRemove.length > 0) {
      logger.info(
        `Removing ${keysToRemove.length} connections for workspace: ${workspaceId}`
      );

      await Promise.allSettled(
        keysToRemove.map((key) => this.removeConnection(key))
      );
    }

    return keysToRemove.length;
  }

  /**
   * Evict the oldest (least recently used) connection
   */
  private async evictOldestConnection(): Promise<void> {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, conn] of this.connections) {
      if (conn.lastActivity < oldestTime) {
        oldestTime = conn.lastActivity;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      await this.removeConnection(oldestKey);
      logger.info(`Evicted oldest connection: ${oldestKey}`);
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    enabled: boolean;
    connections: Array<{
      poolKey: string;
      serverId: string;
      userId: string;
      ageMs: number;
      idleMs: number;
      healthy: boolean;
      tokenExpiresIn?: number;
    }>;
  } {
    const now = Date.now();
    const connections = Array.from(this.connections.entries()).map(
      ([poolKey, conn]) => ({
        poolKey,
        serverId: conn.config.serverId,
        userId: conn.userId,
        ageMs: now - conn.createdAt,
        idleMs: now - conn.lastActivity,
        healthy: conn.healthy && this.isConnectionValid(conn),
        tokenExpiresIn: conn.tokenExpiresAt
          ? conn.tokenExpiresAt - now
          : undefined,
      })
    );

    return {
      size: this.connections.size,
      maxSize: this.config.maxTotalConnections,
      enabled: this.config.enabled,
      connections,
    };
  }

  /**
   * Start the background cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(
      () => this.cleanup(),
      this.config.cleanupIntervalMs
    );
    // Don't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Clean up expired and unhealthy connections
   */
  private async cleanup(): Promise<void> {
    if (this.isShuttingDown) return;

    const keysToRemove: string[] = [];

    for (const [key, conn] of this.connections) {
      if (!this.isConnectionValid(conn)) {
        keysToRemove.push(key);
      }
    }

    if (keysToRemove.length > 0) {
      logger.info(`Cleanup: removing ${keysToRemove.length} stale connections`);

      // Use allSettled to ensure all connections are attempted to be removed
      // even if some fail
      const results = await Promise.allSettled(
        keysToRemove.map((key) => this.removeConnection(key))
      );

      // Log any failures
      const failures = results.filter((r) => r.status === 'rejected');
      if (failures.length > 0) {
        logger.warn(`Cleanup: ${failures.length} connections failed to close`);
      }
    }
  }

  /**
   * Gracefully shutdown the pool
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    logger.info(`Shutting down pool with ${this.connections.size} connections`);

    const closePromises = Array.from(this.connections.keys()).map((key) =>
      this.removeConnection(key).catch((err) =>
        logger.warn(`Error closing ${key} during shutdown:`, err)
      )
    );

    await Promise.all(closePromises);
    logger.info('Connection pool shutdown complete');
  }

  /**
   * Get the number of active connections
   */
  get size(): number {
    return this.connections.size;
  }

  /**
   * Check if pooling is enabled
   */
  get enabled(): boolean {
    return this.config.enabled;
  }
}

// Singleton instance for the gateway
let poolInstance: UpstreamConnectionPool | null = null;

/**
 * Get the singleton connection pool instance
 */
export function getConnectionPool(
  config?: Partial<PoolConfig>
): UpstreamConnectionPool {
  if (!poolInstance) {
    poolInstance = new UpstreamConnectionPool(config);
  }
  return poolInstance;
}

/**
 * Shutdown the singleton pool (for graceful shutdown)
 */
export async function shutdownConnectionPool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.shutdown();
    poolInstance = null;
  }
}
