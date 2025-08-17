/**
 * @file src/services/sessionStore.ts
 * Persistent session storage with JSON file backend
 * Designed to be easily migrated to Redis later
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { MCPSession, TransportType, TransportCapabilities } from './mcpSession';
import { ServerConfig } from '../types/mcp';
import { createLogger } from '../utils/logger';

const logger = createLogger('SessionStore');

export interface SessionData {
  id: string;
  serverId: string;
  createdAt: number;
  lastActivity: number;
  transportCapabilities?: TransportCapabilities;
  isInitialized: boolean;
  clientTransportType?: TransportType;
  metrics: {
    requests: number;
    toolCalls: number;
    errors: number;
  };
  config: ServerConfig;
}

export interface SessionStoreOptions {
  dataDir?: string;
  persistInterval?: number; // How often to save to disk (ms)
  maxAge?: number; // Max age for sessions (ms)
}

export class SessionStore {
  private sessions = new Map<string, MCPSession>();
  private persistTimer?: NodeJS.Timeout;
  private readonly dataFile: string;
  private readonly maxAge: number;
  private readonly persistInterval: number;

  constructor(options: SessionStoreOptions = {}) {
    const dataDir = options.dataDir || join(process.cwd(), 'data');
    this.dataFile = join(dataDir, 'sessions.json');
    this.maxAge = options.maxAge || 30 * 60 * 1000; // 30 minutes default
    this.persistInterval = options.persistInterval || 30 * 1000; // 30 seconds default

    // Ensure data directory exists
    this.ensureDataDir(dataDir);

    // Start periodic persistence
    this.startPersistence();
  }

  private async ensureDataDir(dataDir: string) {
    try {
      await fs.mkdir(dataDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create data directory', error);
    }
  }

  /**
   * Load session metadata from disk on startup as dormant sessions
   */
  async loadSessions(): Promise<void> {
    try {
      const data = await fs.readFile(this.dataFile, 'utf-8');
      const sessionData: SessionData[] = JSON.parse(data);

      logger.critical(
        `Found ${sessionData.length} session records from before restart`
      );

      // Load sessions as dormant (metadata only, not active connections)
      for (const data of sessionData) {
        if (Date.now() - data.lastActivity < this.maxAge) {
          logger.debug(
            `Loading dormant session ${data.id} for server ${data.serverId}`
          );

          try {
            const session = new MCPSession(data.config);

            // Restore session data but don't initialize connections
            await session.restoreFromData({
              id: data.id,
              createdAt: data.createdAt,
              lastActivity: data.lastActivity,
              metrics: data.metrics,
              transportCapabilities: data.transportCapabilities,
              clientTransportType: data.clientTransportType,
            });

            // Store as dormant session (not initialized, waiting for client reconnection)
            this.sessions.set(data.id, session);
            logger.debug(
              `Dormant session ${data.id} loaded - waiting for client reconnection`
            );
          } catch (error) {
            logger.error(`Failed to load dormant session ${data.id}`, error);
          }
        } else {
          logger.debug(`Expired session ${data.id} will be cleaned up`);
        }
      }

      logger.critical(
        `Server restart completed. ${this.sessions.size} dormant sessions available for reconnection.`
      );
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        logger.debug('No existing session file found, starting fresh');
      } else {
        logger.error('Failed to load session metadata', error);
      }
    }
  }

  /**
   * Get available session metadata for restoration (without creating active session)
   */
  getSessionMetadata(sessionId: string): SessionData | null {
    // Load from file and return metadata if exists and not expired
    try {
      const data = require('fs').readFileSync(this.dataFile, 'utf-8');
      const sessionData: SessionData[] = JSON.parse(data);

      const session = sessionData.find((s) => s.id === sessionId);
      if (session && Date.now() - session.lastActivity < this.maxAge) {
        return session;
      }
    } catch (error) {
      // File doesn't exist or other error
    }

    return null;
  }

  /**
   * Save current sessions to disk
   */
  async saveSessions(): Promise<void> {
    try {
      const sessionData: SessionData[] = [];

      for (const [id, session] of this.sessions.entries()) {
        // Only save sessions that aren't expired
        if (Date.now() - session.lastActivity < this.maxAge) {
          sessionData.push({
            id: session.id,
            serverId: session.config.serverId,
            createdAt: session.createdAt,
            lastActivity: session.lastActivity,
            transportCapabilities: session.getTransportCapabilities(),
            isInitialized: session.isInitialized(),
            clientTransportType: session.getClientTransportType(),
            metrics: session.metrics,
            config: session.config,
          });
        }
      }

      await fs.writeFile(this.dataFile, JSON.stringify(sessionData, null, 2));
      logger.debug(`Saved ${sessionData.length} sessions to disk`);
    } catch (error) {
      logger.error('Failed to save sessions', error);
    }
  }

  /**
   * Start periodic persistence to disk
   */
  private startPersistence(): void {
    this.persistTimer = setInterval(async () => {
      await this.saveSessions();
      await this.cleanup();
    }, this.persistInterval);
  }

  /**
   * Stop periodic persistence
   */
  async stop(): Promise<void> {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = undefined;
    }

    // Save one final time
    await this.saveSessions();
  }

  /**
   * Get a session by ID
   */
  get(sessionId: string): MCPSession | undefined {
    const session = this.sessions.get(sessionId);
    logger.debug(
      `get(${sessionId}) - found: ${!!session}, total sessions: ${this.sessions.size}`
    );
    if (session) {
      // Update last activity when accessed
      session.lastActivity = Date.now();
      logger.debug(
        `Session ${sessionId} state: ${(session as any).getState()}`
      );
    }
    return session;
  }

  /**
   * Set a session
   */
  set(sessionId: string, session: MCPSession): void {
    this.sessions.set(sessionId, session);
    logger.debug(
      `set(${sessionId}) - total sessions now: ${this.sessions.size}`
    );
  }

  /**
   * Delete a session
   */
  delete(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Get all session IDs
   */
  keys(): IterableIterator<string> {
    return this.sessions.keys();
  }

  /**
   * Get all sessions
   */
  values(): IterableIterator<MCPSession> {
    return this.sessions.values();
  }

  /**
   * Get all session entries
   */
  entries(): IterableIterator<[string, MCPSession]> {
    return this.sessions.entries();
  }

  /**
   * Get session count
   */
  get size(): number {
    return this.sessions.size;
  }

  /**
   * Clean up expired sessions
   */
  async cleanup(): Promise<void> {
    const now = Date.now();
    const expiredSessions: string[] = [];

    for (const [id, session] of this.sessions.entries()) {
      if (now - session.lastActivity > this.maxAge) {
        expiredSessions.push(id);
      }
    }

    for (const id of expiredSessions) {
      const session = this.sessions.get(id);
      if (session) {
        logger.debug(`Removing expired session: ${id}`);
        try {
          await session.close();
        } catch (error) {
          logger.error(`Error closing session ${id}`, error);
        } finally {
          this.sessions.delete(id);
        }
      }
    }

    if (expiredSessions.length > 0) {
      logger.info(
        `Cleanup: Removed ${expiredSessions.length} expired sessions, ${this.sessions.size} remaining`
      );
    }
  }

  /**
   * Get active sessions (those accessed recently)
   */
  getActiveSessions(activeThreshold: number = 5 * 60 * 1000): MCPSession[] {
    const now = Date.now();
    return Array.from(this.sessions.values()).filter(
      (session) => now - session.lastActivity < activeThreshold
    );
  }

  /**
   * Get session stats
   */
  getStats() {
    const activeSessions = this.getActiveSessions();
    const totalRequests = Array.from(this.sessions.values()).reduce(
      (sum, session) => sum + session.metrics.requests,
      0
    );
    const totalToolCalls = Array.from(this.sessions.values()).reduce(
      (sum, session) => sum + session.metrics.toolCalls,
      0
    );
    const totalErrors = Array.from(this.sessions.values()).reduce(
      (sum, session) => sum + session.metrics.errors,
      0
    );

    return {
      total: this.sessions.size,
      active: activeSessions.length,
      metrics: {
        totalRequests,
        totalToolCalls,
        totalErrors,
      },
    };
  }
}

/**
 * Redis-compatible interface for future migration
 * This interface ensures easy migration to Redis later
 */
export interface RedisSessionStore {
  get(sessionId: string): Promise<SessionData | null>;
  set(sessionId: string, sessionData: SessionData, ttl?: number): Promise<void>;
  delete(sessionId: string): Promise<boolean>;
  keys(pattern?: string): Promise<string[]>;
  cleanup(): Promise<void>;
  getStats(): Promise<any>;
}

/**
 * Redis implementation placeholder
 * Implement this when migrating to Redis
 */
export class RedisSessionStoreImpl implements RedisSessionStore {
  // TODO: Implement Redis version
  async get(sessionId: string): Promise<SessionData | null> {
    throw new Error('Redis implementation not yet available');
  }

  async set(
    sessionId: string,
    sessionData: SessionData,
    ttl?: number
  ): Promise<void> {
    throw new Error('Redis implementation not yet available');
  }

  async delete(sessionId: string): Promise<boolean> {
    throw new Error('Redis implementation not yet available');
  }

  async keys(pattern?: string): Promise<string[]> {
    throw new Error('Redis implementation not yet available');
  }

  async cleanup(): Promise<void> {
    throw new Error('Redis implementation not yet available');
  }

  async getStats(): Promise<any> {
    throw new Error('Redis implementation not yet available');
  }
}
