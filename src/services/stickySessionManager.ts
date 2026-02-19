import { createHash } from 'crypto';
import { requestCache } from './cache/cacheService';
import { logger } from '../apm';
import { PORTKEY_HEADER_KEYS } from '../middlewares/portkey/globals';

/**
 * Result from getTargetIndex with hash for reuse in setTargetIndex
 */
interface StickySessionResult {
  targetIndex: number | null;
  identifierHash: string | null;
}

/**
 * Context for building sticky session identifier
 */
interface HashContext {
  env: Record<string, any>;
  configVersion: string;
  requestHeaders: Record<string, string>;
  metadata: Record<string, string>;
  params?: Record<string, any>;
}

class StickySessionManager {
  /**
   * Extracts a nested value from an object using dot notation
   * e.g., getNestedValue({a: {b: 1}}, 'a.b') returns 1
   */
  private getNestedValue(obj: Record<string, any>, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Parses a hash field string and extracts value from appropriate source
   * Supports: params.*, metadata.*, headers.*
   */
  private extractFieldValue(
    field: string,
    context: HashContext
  ): string | undefined {
    const [prefix, ...pathParts] = field.split('.');
    const path = pathParts.join('.');

    if (!path) return undefined;

    switch (prefix) {
      case 'params': {
        if (!context.params) return undefined;
        const value = this.getNestedValue(context.params, path);
        return value !== undefined ? String(value) : undefined;
      }

      case 'metadata': {
        try {
          const value = this.getNestedValue(context.metadata, path);
          return value !== undefined ? String(value) : undefined;
        } catch {
          return undefined;
        }
      }

      case 'headers': {
        // Headers are case-insensitive, normalize to lowercase
        const headerKey = path.toLowerCase();
        const value = context.requestHeaders[headerKey];
        return value !== undefined ? String(value) : undefined;
      }

      default:
        return undefined;
    }
  }

  private buildIdentifier(context: HashContext, hashFields?: string[]): string {
    const { requestHeaders } = context;
    const apiKey = requestHeaders[PORTKEY_HEADER_KEYS.API_KEY];

    const parts: string[] = [];

    // Always include API key as base identifier if available
    if (apiKey) {
      parts.push(apiKey);
    }

    if (hashFields && hashFields.length > 0) {
      for (const field of hashFields) {
        const value = this.extractFieldValue(field, context);
        if (value) {
          parts.push(`${field}:${value}`);
        }
      }
    }

    return parts.join('|');
  }

  private hashIdentifier(identifier: string): string {
    return createHash('sha256').update(identifier).digest('hex');
  }

  private getRedisKey(configVersion: string, identifierHash: string): string {
    return `sticky:loadbalance:${configVersion}:${identifierHash}`;
  }

  /**
   * Gets the target index from cache. Returns both the index and hash
   * so the hash can be reused in setTargetIndex without recomputation.
   */
  async getTargetIndex(
    context: HashContext,
    hashFields?: string[]
  ): Promise<StickySessionResult> {
    const identifier = this.buildIdentifier(context, hashFields);
    if (!identifier) {
      return { targetIndex: null, identifierHash: null };
    }

    const identifierHash = this.hashIdentifier(identifier);
    const redisKey = this.getRedisKey(context.configVersion, identifierHash);

    try {
      const value = await requestCache(context.env).get<number>(redisKey, {
        useLocalCache: true,
      });

      if (value !== null && typeof value === 'number') {
        logger.debug(`Sticky session cache hit for hash: ${identifierHash}`);
        return { targetIndex: value, identifierHash };
      }
    } catch (error) {
      logger.error('Error reading sticky session from cache:', error);
    }

    logger.debug(`Sticky session cache miss for hash: ${identifierHash}`);
    return { targetIndex: null, identifierHash };
  }

  /**
   * Sets the target index using a pre-computed hash from getTargetIndex
   */
  async setTargetIndexByHash(
    configVersion: string,
    identifierHash: string | null,
    targetIndex: number,
    ttl: number = 300,
    env?: Record<string, any>
  ): Promise<void> {
    if (!identifierHash) return;

    const redisKey = this.getRedisKey(configVersion, identifierHash);

    try {
      await requestCache(env).set(redisKey, targetIndex, { ttl });
      logger.debug(
        `Sticky session set for hash: ${identifierHash}, target: ${targetIndex}, ttl: ${ttl}s`
      );
    } catch (error) {
      logger.error('Error writing sticky session to cache:', error);
    }
  }
}

export const stickySessionManager = new StickySessionManager();
