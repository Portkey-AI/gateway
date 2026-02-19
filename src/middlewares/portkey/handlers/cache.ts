import { Context } from 'hono';
import { CACHE_STATUS, CacheKeyTypes, PORTKEY_HEADER_KEYS } from '../globals';
import {
  fetchLLMResponseFromCache,
  storeLLMResponseInCache,
} from '../kreacher/cacheHelpers';
import { getCacheKey, getHeaderObj } from '../kreacher/helpers';
import { logger } from '../../../apm';
import { requestCache } from '../../../services/cache/cacheService';

const getCacheMaxAgeFromHeaders = (maxAgeHeader: string) => {
  try {
    const maxAgeFromHeader = maxAgeHeader.match(/max-age=(\d+)/)?.[1];
    if (maxAgeFromHeader) return parseInt(maxAgeFromHeader);
  } catch (err) {
    return null;
  }
  return null;
};

// Cache Handling
export const getFromCache = async (
  env: any,
  c: Context,
  requestHeaders: any,
  requestBody: any,
  url: string,
  organisationId: string,
  cacheMode: string,
  cacheMaxAge: number | null
) => {
  //forward request to Kreacher service binding
  let maxAge: number | null = null;
  const maxAgeHeader = requestHeaders[PORTKEY_HEADER_KEYS.CACHE_CONTROL];
  if (cacheMaxAge) {
    maxAge = cacheMaxAge;
  } else if (maxAgeHeader) {
    maxAge = getCacheMaxAgeFromHeaders(maxAgeHeader);
  }

  const incomingRequestBody: any = {
    headers: requestHeaders,
    request: requestBody,
    url: url,
    organisationId,
    cacheMode: cacheMode ?? requestHeaders[PORTKEY_HEADER_KEYS.CACHE],
    maxAge: maxAge,
  };

  try {
    incomingRequestBody.headersObj = getHeaderObj(
      requestHeaders,
      incomingRequestBody.url,
      incomingRequestBody
    );
    const cacheKey = await getCacheKey(incomingRequestBody);
    const response = await fetchLLMResponseFromCache(
      env,
      c,
      cacheKey,
      incomingRequestBody
    );
    if (response) {
      if (
        [CACHE_STATUS.HIT, CACHE_STATUS.SEMANTIC_HIT].includes(response.status)
      ) {
        return [response.data, response.status, response.cacheKey];
      } else {
        return [null, response.status, response.cacheKey];
      }
    } else {
      return [null, null, null];
    }
  } catch (error: any) {
    logger.error('getFromCache error', error);
    return [null, null, null];
  }
};

export const putInCache = async (
  env: any,
  c: Context,
  requestHeaders: any,
  requestBody: any,
  responseBody: any,
  url: string,
  organisationId: string,
  cacheMode: string | null,
  cacheMaxAge: number | null,
  cacheKey: string
) => {
  let maxAge: number | null = null;
  const maxAgeHeader = requestHeaders[PORTKEY_HEADER_KEYS.CACHE_CONTROL];
  if (cacheMaxAge) {
    maxAge = cacheMaxAge;
  } else if (maxAgeHeader) {
    maxAge = getCacheMaxAgeFromHeaders(maxAgeHeader);
  }

  const incomingRequestBody: Record<string, any> = {
    headers: requestHeaders,
    request: requestBody,
    response: responseBody,
    url: url,
    organisationId,
    cacheMode: cacheMode ?? requestHeaders[PORTKEY_HEADER_KEYS.CACHE],
    maxAge: maxAge,
  };

  try {
    incomingRequestBody.headersObj = getHeaderObj(
      requestHeaders,
      incomingRequestBody.url,
      incomingRequestBody
    );
    await storeLLMResponseInCache(env, c, cacheKey, incomingRequestBody);
  } catch (error: any) {
    logger.error({
      message: `putInCache error: ${error.message}`,
    });
  }
};

export function generateV2CacheKey({
  organisationId,
  workspaceId,
  cacheKeyType,
  key,
}: {
  organisationId?: string;
  workspaceId?: string | null;
  cacheKeyType: CacheKeyTypes;
  key: string;
}) {
  let cacheKey = `${cacheKeyType}_${key}_`;
  if (organisationId) {
    cacheKey += `${CacheKeyTypes.ORGANISATION}_${organisationId}_`;
  }
  if (workspaceId) {
    cacheKey += `${CacheKeyTypes.WORKSPACE}_${workspaceId}`;
  }
  return cacheKey;
}

/**
 * Asynchronously fetch data from the KV store.
 *
 * @param {any} env - Hono environment object.
 * @param {string} key - The key that needs to be retrieved from the KV store.
 * @returns {Promise<any | null>} - A Promise that resolves to the fetched data or null if an error occurs.
 */
export const fetchFromKVStore = async (
  env: any,
  key: string,
  useMemCache: boolean = false
): Promise<any | null> => {
  return requestCache(env).get(key, {
    useLocalCache: useMemCache,
  });
};

/**
 * Asynchronously puts data into the KV store.
 *
 * @param {any} env - Hono environment object.
 * @param {string} key - The key that needs to be stored with the value in the KV store.
 * @param {string} value - The data to be stored in the KV store.
 * @param {number} [expiry] - Optional expiration time for the stored data (in seconds).
 * @returns {Promise<void>} - A Promise that resolves when the data is successfully stored or logs an error if it occurs.
 */
export const putInKVStore = async (
  env: any,
  key: string,
  value: any,
  expiry?: number
): Promise<boolean> => {
  return requestCache(env).set(key, value, {
    ttl: expiry,
  });
};
