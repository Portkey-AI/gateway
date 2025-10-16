/**
 * @file src/services/cache/backends/file.ts
 * File-based cache backend implementation
 */

import { CacheBackend, CacheEntry, CacheOptions, CacheStats } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';

// Using console.log for now to avoid build issues
const logger = {
  debug: (msg: string, ...args: any[]) =>
    console.debug(`[FileCache] ${msg}`, ...args),
  info: (msg: string, ...args: any[]) =>
    console.info(`[FileCache] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) =>
    console.warn(`[FileCache] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) =>
    console.error(`[FileCache] ${msg}`, ...args),
};

interface FileCacheData {
  [namespace: string]: {
    [key: string]: CacheEntry;
  };
}

export class FileCacheBackend implements CacheBackend {
  private cacheFile: string;
  private data: FileCacheData = {};
  private saveTimer?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;
  private loaded: boolean = false;
  private loadPromise: Promise<void>;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    size: 0,
    expired: 0,
  };
  private saveInterval: number;
  constructor(
    dataDir: string = 'data',
    fileName: string = 'cache.json',
    saveIntervalMs: number = 1000,
    cleanupIntervalMs: number = 60000
  ) {
    this.cacheFile = path.join(process.cwd(), dataDir, fileName);
    this.saveInterval = saveIntervalMs;
    this.loadPromise = this.loadCache();
    this.loadPromise.then(() => {
      this.startCleanup(cleanupIntervalMs);
    });
  }

  // Ensure cache is loaded before any operation
  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) {
      await this.loadPromise;
    }
  }

  private async ensureDataDir(): Promise<void> {
    const dir = path.dirname(this.cacheFile);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create cache directory:', error);
    }
  }

  private async loadCache(): Promise<void> {
    try {
      const content = await fs.readFile(this.cacheFile, 'utf-8');
      this.data = JSON.parse(content);
      this.updateStats();
      logger.debug('Loaded cache from disk', this.cacheFile);
      this.loaded = true;
    } catch (error) {
      // File doesn't exist or is invalid, start with empty cache
      this.data = {};
      logger.debug('Starting with empty cache');
    }
  }

  private async saveCache(): Promise<void> {
    try {
      await this.ensureDataDir();
      await fs.writeFile(this.cacheFile, JSON.stringify(this.data, null, 2));
      logger.debug('Saved cache to disk');
    } catch (error) {
      logger.error('Failed to save cache:', error);
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      this.saveCache();
      this.saveTimer = undefined;
    }, this.saveInterval);
  }

  private startCleanup(intervalMs: number): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, intervalMs);
  }

  private isExpired(entry: CacheEntry): boolean {
    return entry.expiresAt !== undefined && entry.expiresAt <= Date.now();
  }

  private updateStats(): void {
    let totalSize = 0;
    let totalExpired = 0;

    for (const namespace of Object.values(this.data)) {
      for (const entry of Object.values(namespace)) {
        totalSize++;
        if (this.isExpired(entry)) {
          totalExpired++;
        }
      }
    }

    this.stats.size = totalSize;
    this.stats.expired = totalExpired;
  }

  private getNamespaceData(
    namespace: string = 'default'
  ): Record<string, CacheEntry> {
    if (!this.data[namespace]) {
      this.data[namespace] = {};
    }
    return this.data[namespace];
  }

  async get<T = any>(
    key: string,
    namespace?: string
  ): Promise<CacheEntry<T> | null> {
    await this.ensureLoaded(); // Wait for load to complete

    const namespaceData = this.getNamespaceData(namespace);
    const entry = namespaceData[key];

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (this.isExpired(entry)) {
      delete namespaceData[key];
      this.stats.expired++;
      this.stats.misses++;
      this.scheduleSave();
      return null;
    }

    this.stats.hits++;
    return entry as CacheEntry<T>;
  }

  async set<T = any>(
    key: string,
    value: T,
    options: CacheOptions = {}
  ): Promise<void> {
    await this.ensureLoaded(); // Wait for load to complete

    const namespace = options.namespace || 'default';
    const namespaceData = this.getNamespaceData(namespace);
    const now = Date.now();

    const entry: CacheEntry<T> = {
      value,
      createdAt: now,
      expiresAt: options.ttl ? now + options.ttl : undefined,
      metadata: options.metadata,
    };

    namespaceData[key] = entry;
    this.stats.sets++;
    this.updateStats();
    this.scheduleSave();
  }

  async delete(key: string, namespace?: string): Promise<boolean> {
    const namespaceData = this.getNamespaceData(namespace);
    const existed = key in namespaceData;

    if (existed) {
      delete namespaceData[key];
      this.stats.deletes++;
      this.updateStats();
      this.scheduleSave();
    }

    return existed;
  }

  async clear(namespace?: string): Promise<void> {
    if (namespace) {
      const namespaceData = this.getNamespaceData(namespace);
      const count = Object.keys(namespaceData).length;
      this.data[namespace] = {};
      this.stats.deletes += count;
    } else {
      const totalCount = Object.values(this.data).reduce(
        (sum, ns) => sum + Object.keys(ns).length,
        0
      );
      this.data = {};
      this.stats.deletes += totalCount;
    }

    this.updateStats();
    this.scheduleSave();
  }

  async has(key: string, namespace?: string): Promise<boolean> {
    const namespaceData = this.getNamespaceData(namespace);
    const entry = namespaceData[key];

    if (!entry) return false;

    if (this.isExpired(entry)) {
      delete namespaceData[key];
      this.stats.expired++;
      this.scheduleSave();
      return false;
    }

    return true;
  }

  async keys(namespace?: string): Promise<string[]> {
    if (namespace) {
      const namespaceData = this.getNamespaceData(namespace);
      return Object.keys(namespaceData);
    }

    const allKeys: string[] = [];
    for (const namespaceData of Object.values(this.data)) {
      allKeys.push(...Object.keys(namespaceData));
    }
    return allKeys;
  }

  async getStats(namespace?: string): Promise<CacheStats> {
    if (namespace) {
      const namespaceData = this.getNamespaceData(namespace);
      const keys = Object.keys(namespaceData);
      let expired = 0;

      for (const key of keys) {
        const entry = namespaceData[key];
        if (this.isExpired(entry)) {
          expired++;
        }
      }

      return {
        ...this.stats,
        size: keys.length,
        expired,
      };
    }

    this.updateStats();
    return { ...this.stats };
  }

  async cleanup(): Promise<void> {
    let expiredCount = 0;
    let hasChanges = false;

    for (const [, namespaceData] of Object.entries(this.data)) {
      for (const [key, entry] of Object.entries(namespaceData)) {
        if (this.isExpired(entry)) {
          delete namespaceData[key];
          expiredCount++;
          hasChanges = true;
        }
      }
    }

    if (hasChanges) {
      this.stats.expired += expiredCount;
      this.updateStats();
      this.scheduleSave();
      logger.debug(`Cleaned up ${expiredCount} expired entries`);
    }
  }

  // Add method to check if ready
  async waitForReady(): Promise<void> {
    await this.loadPromise;
  }

  async close(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      await this.saveCache(); // Final save
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }

    logger.debug('File cache backend closed');
  }
}
