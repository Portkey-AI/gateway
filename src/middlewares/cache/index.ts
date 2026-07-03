import { Context } from 'hono';
import { getDefaultCache } from '../../shared/services/cache/index';

function getLLMCache() {
  try {
    return getDefaultCache();
  } catch {
    return null;
  }
}

const inMemoryCache: any = {};

const CACHE_STATUS = {
  HIT: 'HIT',
  SEMANTIC_HIT: 'SEMANTIC HIT',
  MISS: 'MISS',
  SEMANTIC_MISS: 'SEMANTIC MISS',
  REFRESH: 'REFRESH',
  DISABLED: 'DISABLED',
};

const getCacheKey = async (requestBody: any, url: string) => {
  const stringToHash = `${JSON.stringify(requestBody)}-${url}`;
  const myText = new TextEncoder().encode(stringToHash);
  let cacheDigest = await crypto.subtle.digest(
    {
      name: 'SHA-256',
    },
    myText
  );
  return Array.from(new Uint8Array(cacheDigest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

// Cache Handling
export const getFromCache = async (
  env: any,
  requestHeaders: any,
  requestBody: any,
  url: string,
  organisationId: string,
  cacheMode: string,
  cacheMaxAge: number | null
) => {
  if ('x-portkey-cache-force-refresh' in requestHeaders) {
    return [null, CACHE_STATUS.REFRESH, null];
  }
  try {
    const cacheKey = await getCacheKey(requestBody, url);
    const cache = getLLMCache();

    if (cache) {
      const cached = await cache.get(cacheKey, 'llm-responses');
      if (cached) {
        return [cached, CACHE_STATUS.HIT, cacheKey];
      }
      return [null, CACHE_STATUS.MISS, null];
    }

    // Fallback: in-memory
    if (cacheKey in inMemoryCache) {
      const cacheObject = inMemoryCache[cacheKey];
      if (cacheObject.maxAge && cacheObject.maxAge < Date.now()) {
        delete inMemoryCache[cacheKey];
        return [null, CACHE_STATUS.MISS, null];
      }
      return [cacheObject.responseBody, CACHE_STATUS.HIT, cacheKey];
    } else {
      return [null, CACHE_STATUS.MISS, null];
    }
  } catch (error) {
    console.error('getFromCache error: ', error);
    return [null, CACHE_STATUS.MISS, null];
  }
};

export const putInCache = async (
  env: any,
  requestHeaders: any,
  requestBody: any,
  responseBody: any,
  url: string,
  organisationId: string,
  cacheMode: string | null,
  cacheMaxAge: number | null
) => {
  if (requestBody.stream) {
    return;
  }

  const cacheKey = await getCacheKey(requestBody, url);
  const responseString = JSON.stringify(responseBody);
  const cache = getLLMCache();

  if (cache) {
    const ttl = cacheMaxAge ? cacheMaxAge - Date.now() : 24 * 60 * 60 * 1000;
    if (ttl <= 0) return;
    await cache.set(cacheKey, responseString, {
      namespace: 'llm-responses',
      ttl,
    });
  } else {
    // Fallback: in-memory
    inMemoryCache[cacheKey] = {
      responseBody: responseString,
      maxAge: cacheMaxAge,
    };
  }
};

export const memoryCache = () => {
  return async (c: Context, next: any) => {
    c.set('getFromCache', getFromCache);

    await next();

    let requestOptions = c.get('requestOptions');

    if (
      requestOptions &&
      Array.isArray(requestOptions) &&
      requestOptions.length > 0 &&
      !requestOptions[0].requestParams?.stream
    ) {
      requestOptions = requestOptions[0];
      if (requestOptions.cacheMode === 'simple') {
        await putInCache(
          null,
          null,
          requestOptions.transformedRequest.body,
          await requestOptions.response.clone().json(),
          requestOptions.providerOptions.rubeusURL,
          '',
          null,
          new Date().getTime() +
            (requestOptions.cacheMaxAge || 24 * 60 * 60 * 1000)
        );
      }
    }
  };
};
