/**
 * @file src/services/sessionStore.ts
 * Persistent session storage using unified cache service
 * Supports both in-memory and file-based backends, ready for Redis
 */

import { MCPSession, TransportType, TransportCapabilities } from './mcpSession';
import { ServerConfig } from '../../types/mcp';
import { createLogger } from '../../utils/logger';
import { getSessionCache } from '../cache';
import { Context } from 'hono';

const logger = createLogger('SessionStore');

export interface SessionData {
  id: string;
  serverId: string;
  workspaceId: string;
  createdAt: number;
  lastActivity: number;
  transportCapabilities?: TransportCapabilities;
  isInitialized: boolean;
  clientTransportType?: TransportType;
  config: ServerConfig;
  // Token expiration for session lifecycle
  tokenExpiresAt?: number;
  gatewayToken?: any;
  upstreamSessionId?: string;
}

export interface SessionStoreOptions {
  maxAge?: number; // Max age for sessions (ms)
}

const SESSIONS_NAMESPACE = 'sessions';

export class SessionStore {
  private cache;
  private activeSessionsMap = new Map<string, MCPSession>(); // Only for active connections

  constructor(options: SessionStoreOptions = {}) {
    this.cache = getSessionCache();
    // Note: Cleanup is handled by the underlying cache backend automatically
    // Active sessions are validated on access, so no periodic cleanup needed
  }

  /**
   * Get available session metadata for restoration (without creating active session)
   */
  async getSessionMetadata(sessionId: string): Promise<SessionData | null> {
    // Cache already handles expiration based on TTL
    return await this.cache.get<SessionData>(sessionId, SESSIONS_NAMESPACE);
  }

  /**
   * Save session metadata to cache
   */
  private async saveSessionMetadata(session: MCPSession): Promise<void> {
    const tokenExpiration = session.getTokenExpiration();
    const sessionData: SessionData = {
      id: session.id,
      serverId: session.config.serverId,
      workspaceId: session.config.workspaceId,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      transportCapabilities: session.getTransportCapabilities(),
      isInitialized: session.isInitialized,
      clientTransportType: session.getClientTransportType(),
      config: session.config,
      tokenExpiresAt: tokenExpiration.expiresAt,
      gatewayToken: session.gatewayToken,
      upstreamSessionId: session.upstreamSessionId,
    };

    // Save with TTL - cache handles expiration automatically
    await this.cache.set(session.id, sessionData, {
      namespace: SESSIONS_NAMESPACE,
    });
  }

  /**
   * Save all active sessions to cache
   */
  async saveActiveSessions(): Promise<void> {
    try {
      const savePromises: Promise<void>[] = [];

      // Only save currently active sessions
      for (const [id, session] of this.activeSessionsMap.entries()) {
        savePromises.push(this.saveSessionMetadata(session));
      }

      await Promise.all(savePromises);
      logger.debug(`Saved ${savePromises.length} active sessions to cache`);
    } catch (error) {
      logger.error('Failed to save active sessions', error);
    }
  }

  /**
   * Stop the session store
   */
  async stop(): Promise<void> {
    // Save all active sessions one final time
    await this.saveActiveSessions();

    // Close active sessions
    for (const session of this.activeSessionsMap.values()) {
      try {
        await session.close();
      } catch (error) {
        logger.error(`Error closing session ${session.id}`, error);
      }
    }

    // Note: Don't close the cache here as it's shared across the application
    // Cache cleanup is handled by the cache backend itself
  }

  /**
   * Get a session by ID
   */
  async get(sessionId: string, c?: Context): Promise<MCPSession | undefined> {
    // First check active sessions
    let session = this.activeSessionsMap.get(sessionId);

    if (session) {
      logger.debug(`Found active session ${sessionId}`);
      session.lastActivity = Date.now();
      // Update cache with new last activity
      await this.saveSessionMetadata(session);
      return session;
    }

    // Try to restore from cache
    const sessionData = await this.cache.get<SessionData>(
      sessionId,
      SESSIONS_NAMESPACE
    );
    if (!sessionData) {
      logger.debug(`Session ${sessionId} not found in cache`);
      return undefined;
    }

    // Restore dormant session
    logger.debug(`Restoring dormant session ${sessionId} from cache`);
    session = new MCPSession({
      config: sessionData.config,
      sessionId: sessionId,
      gatewayToken: sessionData.gatewayToken,
      upstreamSessionId: sessionData.upstreamSessionId,
      context: c,
    });

    await session.restoreFromData({
      id: sessionData.id,
      createdAt: sessionData.createdAt,
      lastActivity: Date.now(), // Update activity time
      transportCapabilities: sessionData.transportCapabilities,
      clientTransportType: sessionData.clientTransportType,
      tokenExpiresAt: sessionData.tokenExpiresAt,
      upstreamSessionId: sessionData.upstreamSessionId,
    });

    // Add to active sessions
    this.activeSessionsMap.set(sessionId, session);

    // Update cache with new activity time
    await this.saveSessionMetadata(session);

    return session;
  }

  /**
   * Set a session
   */
  async set(sessionId: string, session: MCPSession): Promise<void> {
    // Add to active sessions
    this.activeSessionsMap.set(sessionId, session);
    logger.debug(
      `set(${sessionId}) - active sessions: ${this.activeSessionsMap.size}`
    );

    // Save to cache immediately
    await this.saveSessionMetadata(session);
  }

  /**
   * Delete a session
   */
  async delete(sessionId: string): Promise<boolean> {
    // Remove from active sessions
    const wasActive = this.activeSessionsMap.delete(sessionId);

    // Always try to delete from cache (might be dormant)
    const wasInCache = await this.cache.delete(sessionId, SESSIONS_NAMESPACE);

    return wasActive || wasInCache;
  }

  /**
   * Get all session IDs
   */
  async keys(): Promise<string[]> {
    // Get all keys from cache
    const cachedKeys = await this.cache.keys(SESSIONS_NAMESPACE);
    // Also include active sessions that might not be persisted yet
    const activeKeys = Array.from(this.activeSessionsMap.keys());
    // Combine and deduplicate
    return [...new Set([...cachedKeys, ...activeKeys])];
  }

  /**
   * Get all active sessions
   */
  values(): IterableIterator<MCPSession> {
    return this.activeSessionsMap.values();
  }

  /**
   * Get all active session entries
   */
  entries(): IterableIterator<[string, MCPSession]> {
    return this.activeSessionsMap.entries();
  }

  /**
   * Get total session count (active + dormant)
   */
  async getTotalSize(): Promise<number> {
    const cachedKeys = await this.cache.keys(SESSIONS_NAMESPACE);
    return cachedKeys.length;
  }

  /**
   * Get active session count
   */
  get activeSize(): number {
    return this.activeSessionsMap.size;
  }

  /**
   * Manual cleanup of expired active sessions
   * Note: This is typically not needed as sessions are validated on access.
   * Cache handles cleanup of dormant sessions automatically via TTL.
   * This method is kept for manual cleanup if needed.
   */
  async cleanup(): Promise<void> {
    const expiredSessions: string[] = [];

    // Only check active sessions for token expiration
    for (const [id, session] of this.activeSessionsMap.entries()) {
      if (session.isTokenExpired()) {
        expiredSessions.push(id);
        logger.debug(
          `Active session ${id} marked for removal due to token expiration`
        );
      }
    }

    // Remove expired active sessions
    for (const id of expiredSessions) {
      const session = this.activeSessionsMap.get(id);
      if (session) {
        logger.debug(`Removing expired active session: ${id}`);
        try {
          await session.close();
        } catch (error) {
          logger.error(`Error closing session ${id}`, error);
        } finally {
          this.activeSessionsMap.delete(id);
          // Note: Cache will auto-expire based on TTL
        }
      }
    }

    if (expiredSessions.length > 0) {
      logger.info(
        `Cleanup: Removed ${expiredSessions.length} expired active sessions, ${this.activeSessionsMap.size} active remaining`
      );
    }
  }

  /**
   * Get active sessions (those currently in memory)
   */
  getActiveSessions(): MCPSession[] {
    return Array.from(this.activeSessionsMap.values());
  }

  /**
   * Get session stats
   */
  async getStats() {
    const activeSessions = this.getActiveSessions();

    // Get cache stats for complete picture
    const cacheStats = await this.cache.getStats(SESSIONS_NAMESPACE);
    const totalSessions = await this.getTotalSize();

    return {
      sessions: {
        total: totalSessions,
        active: activeSessions.length,
        dormant: totalSessions - activeSessions.length,
      },
      cache: {
        size: cacheStats.size,
        hits: cacheStats.hits,
        misses: cacheStats.misses,
        expired: cacheStats.expired,
      },
    };
  }
}

// Create singleton instance
let sessionStoreInstance: SessionStore | null = null;

/**
 * Get or create the singleton SessionStore instance
 */
export function getSessionStore(): SessionStore {
  if (!sessionStoreInstance) {
    sessionStoreInstance = new SessionStore({
      maxAge: parseInt(process.env.SESSION_MAX_AGE || '3600000'), // 1 hour default
    });
  }
  return sessionStoreInstance;
}
