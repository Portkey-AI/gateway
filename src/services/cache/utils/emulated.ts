import {
  ICacheProvider,
  ISetOperations,
  IAtomicOperations,
  SetMembersCacheOptions,
} from '../types';

export class EmulatedSetOperations implements ISetOperations {
  constructor(private cache: ICacheProvider) {}

  async addToSet(
    key: string,
    members: string[],
    namespace?: string
  ): Promise<number> {
    if (members.length === 0) return 0;

    const existing = await this.getSetMembers(key, namespace);
    const sizeBefore = existing.size;
    members.forEach((m) => existing.add(m));

    await this.cache.set(key, Array.from(existing), { namespace });
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

    await this.cache.set(key, Array.from(existing), { namespace });
    return sizeBefore - existing.size;
  }

  async getSetMembers(
    key: string,
    namespace?: string,
    options?: SetMembersCacheOptions
  ): Promise<Set<string>> {
    // For emulated sets, we use the cache's get method which already handles local caching
    const value = await this.cache.get<string[]>(key, {
      namespace,
      useLocalCache: options?.useLocalCache,
      localCacheTtl: options?.localCacheTtl,
    });
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
}

export class EmulatedAtomicOperations implements IAtomicOperations {
  constructor(private cache: ICacheProvider) {}

  async increment(
    key: string,
    amount = 1,
    namespace?: string
  ): Promise<number> {
    const current = await this.getAtomicValue(key, namespace);
    const newValue = current + amount;
    await this.cache.set(key, newValue, { namespace });
    return newValue;
  }

  async decrement(
    key: string,
    amount = 1,
    namespace?: string
  ): Promise<number> {
    return this.increment(key, -amount, namespace);
  }

  async getAtomicValue(key: string, namespace?: string): Promise<number> {
    const value = await this.cache.get<number>(key, { namespace });
    return value ?? 0;
  }
}
