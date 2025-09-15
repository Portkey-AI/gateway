/**
 * @file src/services/sessionStore.ts
 * Persistent session storage using unified cache service
 * Supports both in-memory and file-based backends, ready for Redis
 */

import {
  MCPSession,
  TransportType,
  TransportCapabilities,
} from '../../mcp/services/mcpSession';
import { ServerConfig } from '../types/mcp';
import { createLogger } from '../../shared/utils/logger';
import { CacheService, getSessionCache } from '../../shared/services/cache';
import { Context } from 'hono';

const logger = createLogger('SessionStore');
const SESSIONS_NAMESPACE = 'sessions';

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
  tokenExpiresAt?: number;
  gatewayToken?: any;
  upstreamSessionId?: string;
}

export interface SessionStoreOptions {
  maxAge?: number; // Max age for sessions (ms)
}

export class SessionStore {
  private cache: CacheService;
  private activeSessions = new Map<string, MCPSession>();

  constructor(options: SessionStoreOptions = {}) {
    this.cache = getSessionCache();
  }

  /**
   * Convert session to cacheable data
   */
  private toSessionData(session: MCPSession): SessionData {
    const { expiresAt } = session.getTokenExpiration();
    return {
      id: session.id,
      serverId: session.config.serverId,
      workspaceId: session.config.workspaceId,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      transportCapabilities: session.getTransportCapabilities(),
      isInitialized: session.isInitialized,
      clientTransportType: session.getClientTransportType(),
      config: session.config,
      tokenExpiresAt: expiresAt,
      gatewayToken: session.gatewayToken,
      upstreamSessionId: session.upstreamSessionId,
    };
  }

  /**
   * Save session to cache
   */
  private async saveSession(session: MCPSession): Promise<void> {
    await this.cache.set(session.id, this.toSessionData(session), {
      namespace: SESSIONS_NAMESPACE,
    });
  }

  /**
   * Restore session from cached data
   */
  private async restoreSession(
    sessionData: SessionData,
    context?: Context
  ): Promise<MCPSession> {
    const session = new MCPSession({
      config: sessionData.config,
      sessionId: sessionData.id,
      gatewayToken: sessionData.gatewayToken,
      upstreamSessionId: sessionData.upstreamSessionId,
      context,
    });

    await session.restoreFromData({
      id: sessionData.id,
      createdAt: sessionData.createdAt,
      lastActivity: Date.now(),
      transportCapabilities: sessionData.transportCapabilities,
      clientTransportType: sessionData.clientTransportType,
      tokenExpiresAt: sessionData.tokenExpiresAt,
      upstreamSessionId: sessionData.upstreamSessionId,
    });

    return session;
  }

  /**
   * Get session metadata without creating active session
   */
  async getSessionMetadata(sessionId: string): Promise<SessionData | null> {
    return await this.cache.get<SessionData>(sessionId, SESSIONS_NAMESPACE);
  }

  /**
   * Get or restore a session
   */
  async get(
    sessionId: string,
    context?: Context
  ): Promise<MCPSession | undefined> {
    // Check active sessions first
    let session = this.activeSessions.get(sessionId);

    if (session) {
      logger.debug(`Found active session ${sessionId}`);
      session.lastActivity = Date.now();
      await this.saveSession(session);
      return session;
    }

    // Try to restore from cache
    const sessionData = await this.getSessionMetadata(sessionId);
    if (!sessionData) {
      logger.debug(`Session ${sessionId} not found`);
      return undefined;
    }

    // Restore and activate session
    logger.debug(`Restoring session ${sessionId} from cache`);
    session = await this.restoreSession(sessionData, context);

    this.activeSessions.set(sessionId, session);
    await this.saveSession(session);

    return session;
  }

  /**
   * Add or update a session
   */
  async set(sessionId: string, session: MCPSession): Promise<void> {
    this.activeSessions.set(sessionId, session);
    await this.saveSession(session);
    logger.debug(`set(${sessionId}) - active: ${this.activeSessions.size}`);
  }

  /**
   * Remove a session
   */
  async delete(sessionId: string): Promise<boolean> {
    const wasActive = this.activeSessions.delete(sessionId);
    const wasInCache = await this.cache.delete(sessionId, SESSIONS_NAMESPACE);
    return wasActive || wasInCache;
  }

  /**
   * Get all session IDs (active + cached)
   */
  async keys(): Promise<string[]> {
    const cachedKeys = await this.cache.keys(SESSIONS_NAMESPACE);
    const activeKeys = Array.from(this.activeSessions.keys());
    return [...new Set([...cachedKeys, ...activeKeys])];
  }

  /**
   * Save all active sessions to cache
   */
  async saveActiveSessions(): Promise<void> {
    try {
      await Promise.all(
        Array.from(this.activeSessions.values()).map((s) => this.saveSession(s))
      );
      logger.debug(`Saved ${this.activeSessions.size} active sessions`);
    } catch (error) {
      logger.error('Failed to save active sessions', error);
    }
  }

  /**
   * Cleanup expired sessions
   */
  async cleanup(): Promise<void> {
    const expired = Array.from(this.activeSessions.entries()).filter(
      ([_, session]) => session.isTokenExpired()
    );

    for (const [id, session] of expired) {
      logger.debug(`Removing expired session: ${id}`);
      try {
        await session.close();
      } catch (error) {
        logger.error(`Error closing session ${id}`, error);
      } finally {
        this.activeSessions.delete(id);
      }
    }

    if (expired.length > 0) {
      logger.info(`Removed ${expired.length} expired sessions`);
    }
  }

  /**
   * Gracefully stop the store
   */
  async stop(): Promise<void> {
    await this.saveActiveSessions();

    for (const session of this.activeSessions.values()) {
      try {
        await session.close();
      } catch (error) {
        logger.error(`Error closing session ${session.id}`, error);
      }
    }
  }

  /**
   * Get store statistics
   */
  async getStats() {
    const cacheStats = await this.cache.getStats(SESSIONS_NAMESPACE);
    const total = await this.getTotalSize();
    const active = this.activeSize;

    return {
      sessions: {
        total,
        active,
        dormant: total - active,
      },
      cache: cacheStats,
    };
  }

  // Simple getters
  values = () => this.activeSessions.values();
  entries = () => this.activeSessions.entries();
  getActiveSessions = () => Array.from(this.activeSessions.values());
  get activeSize() {
    return this.activeSessions.size;
  }
  async getTotalSize() {
    return (await this.keys()).length;
  }
}

// Singleton instance
let instance: SessionStore | null = null;

export function getSessionStore(): SessionStore {
  if (!instance) {
    instance = new SessionStore({
      maxAge: parseInt(process.env.SESSION_MAX_AGE || '3600000'),
    });
  }
  return instance;
}
