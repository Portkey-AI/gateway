import { requestCache } from '../../../services/cache/cacheService';

export const KVStore = {
  get: async (env: Record<string, any>, key: string) => {
    const cache = requestCache(env);
    return cache.getFromReplica(key);
  },
  put: async (
    env: Record<string, any>,
    key: string,
    value: any,
    expiry: number
  ) => {
    const cache = requestCache(env);
    return cache.set(key, value, { ttl: expiry });
  },
  del: async (env: Record<string, any>, key: string) => {
    const cache = requestCache(env);
    return cache.delete(key);
  },
};
