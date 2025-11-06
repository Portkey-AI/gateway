import { getDefaultCache } from '../../shared/services/cache';

export const getFromKV = async (
  key: string,
  useMemCache?: boolean,
  memCacheExpiry?: number
) => {
  let value;
  try {
    value = await getDefaultCache().get(key);
  } catch (err: any) {
    value = null;
    console.error('getFromKV error: ', err.message);
  }
  return value;
};

export const putInKV = async (
  key: string,
  value: any,
  expiry = 604800 // 7 days
) => {
  let result = true;
  try {
    await getDefaultCache().set(key, value, { ttl: expiry });
  } catch (err: any) {
    result = false;
    console.error('putInKV error: ', err.message);
  }

  return result;
};

export const deleteFromKV = async (key: string) => {
  let result = true;
  try {
    await getDefaultCache().delete(key);
  } catch (err: any) {
    result = false;
    console.error('deleteFromKV error: ', err.message);
  }

  return result;
};
