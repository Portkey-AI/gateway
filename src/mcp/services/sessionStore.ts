/**
 * MCP Gateway Session Store
 * Persistent session storage with cache backend support
 * Supports both in-memory and Redis backends
 */

import { MCPSession, getSessionManager } from './mcpSession.js';
import type {
  ServerConfig,
  TransportType,
  TransportCapabilities,
} from '../types/index.js';
import { createLogger } from '../../shared/utils/logger.js';
import { CacheService, getSessionCache } from '../../shared/services/cache/index.js';
import type { Context } from 'hono';

const logger = createLogger('SessionStore');

interface SessionData {
  sessionId: string;
  serverUrl: string;
  apiKeyHash: string;
  createdAt: number;
  lastActivity: number;
  config: ServerConfig;
  transportCapabilities?: TransportCapabilities;
  clientTransportType?: TransportType;
  gatewayToken?: any;
  upstreamSessionId?: string;
  metrics?: {
    requests: number;
    toolCalls: number;
    errors: number;
  };
}

/**
 * Session Store
 * Manages session persistence and recovery
 */
export class SessionStore {
  private activeSessionsMap: Map<string, MCPSession> = new Map();
  private cache: CacheService;
  private persistInterval: NodeJS.Timeout | null = null;
  private maxAge: number;

  constructor(options?: {
    persistInterval?: number;
    maxAge?: number;
  }) {
    this.cache = getSessionCache();
    this.maxAge = options?.maxAge || 60 * 60 * 1000; // 1 hour default

    // Start persistence interval
    if (options?.persistInterval) {
      this.persistInterval = setInterval(async () => {
        await this.persistAllSessions();
      }, options.persistInterval);
    }
  }

  /**
   * Set a session in the store
   */
  async set(sessionId: string, session: MCPSession): Promise<void> {
    this.activeSessionsMap.set(sessionId, session);
    await this.persistSession(sessionId, session);
  }

  /**
   * Get a session by ID
   * Note: Session restoration from cache requires fresh credentials (apiKey)
   * since we don't store sensitive credentials in cache
   */
  async get(sessionId: string, c?: Context): Promise<MCPSession | undefined> {
    // First check active sessions
    let session = this.activeSessionsMap.get(sessionId);

    if (session) {
      logger.debug(`Session ${sessionId} found in active sessions`);
      return session;
    }

    // Check if session data exists in cache (for reference)
    const sessionData = await this.cache.get<SessionData>(sessionId, 'sessions');

    if (!sessionData) {
      logger.debug(`Session ${sessionId} not found in cache`);
      return undefined;
    }

    // Session data exists but we can't fully restore without fresh credentials
    // The caller should create a new session with current request credentials
    logger.debug(`Session ${sessionId} found in cache but requires fresh credentials to restore`);
    return undefined;
  }

  /**
   * Delete a session
   */
  async delete(sessionId: string): Promise<void> {
    const session = this.activeSessionsMap.get(sessionId);
    if (session) {
      session.close();
    }
    this.activeSessionsMap.delete(sessionId);
    await this.cache.delete(sessionId, 'sessions');
    logger.debug(`Session ${sessionId} deleted`);
  }

  /**
   * Persist a single session to cache
   * Note: API key is not stored - only the hash for identification
   */
  private async persistSession(
    sessionId: string,
    session: MCPSession
  ): Promise<void> {
    const info = session.getInfo();
    const sessionData: SessionData = {
      sessionId: info.sessionId,
      serverUrl: info.serverUrl,
      apiKeyHash: info.apiKeyHash,
      createdAt: info.createdAt.getTime(),
      lastActivity: info.lastActivityAt.getTime(),
      config: {} as ServerConfig, // Would need to store actual config
      clientTransportType: info.clientTransportType,
      transportCapabilities: {
        clientTransport: info.clientTransportType,
        upstreamTransport: info.upstreamTransportType,
      },
    };

    await this.cache.set(sessionId, sessionData, {
      namespace: 'sessions',
      ttl: this.maxAge,
    });
  }

  /**
   * Persist all active sessions
   */
  private async persistAllSessions(): Promise<void> {
    const count = this.activeSessionsMap.size;
    if (count === 0) return;

    logger.debug(`Persisting ${count} sessions`);

    for (const [sessionId, session] of this.activeSessionsMap) {
      try {
        await this.persistSession(sessionId, session);
      } catch (error) {
        logger.error(`Failed to persist session ${sessionId}`, error);
      }
    }
  }

  /**
   * Get stats about the session store
   */
  getStats(): { active: number } {
    return {
      active: this.activeSessionsMap.size,
    };
  }

  /**
   * Cleanup expired sessions
   */
  async cleanup(): Promise<void> {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.activeSessionsMap) {
      if (session.isExpired()) {
        await this.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} expired sessions`);
    }
  }

  /**
   * Load sessions from cache on startup
   */
  async loadSessions(): Promise<void> {
    // This would require listing all sessions from cache
    // Implementation depends on cache backend capabilities
    logger.info('Session loading from cache not yet implemented');
  }

  /**
   * Stop the session store
   */
  async stop(): Promise<void> {
    if (this.persistInterval) {
      clearInterval(this.persistInterval);
      this.persistInterval = null;
    }

    // Persist all sessions before stopping
    await this.persistAllSessions();

    // Close all active sessions
    for (const session of this.activeSessionsMap.values()) {
      session.close();
    }
    this.activeSessionsMap.clear();

    logger.info('Session store stopped');
  }
}

// Singleton instance
let sessionStoreInstance: SessionStore | null = null;

export function getSessionStore(): SessionStore {
  if (!sessionStoreInstance) {
    sessionStoreInstance = new SessionStore({
      persistInterval: 30 * 1000, // 30 seconds
      maxAge: 60 * 60 * 1000, // 1 hour
    });
  }
  return sessionStoreInstance;
}

export { SessionData };
