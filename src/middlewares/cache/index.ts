import { Context } from 'hono';

const inMemoryCache: any = {};

const CACHE_STATUS = {
  HIT: 'HIT',
  SEMANTIC_HIT: 'SEMANTIC HIT',
  MISS: 'MISS',
  SEMANTIC_MISS: 'SEMANTIC MISS',
  REFRESH: 'REFRESH',
  DISABLED: 'DISABLED',
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
    const stringToHash = `${JSON.stringify(requestBody)}-${url}`;
    const myText = new TextEncoder().encode(stringToHash);

    let cacheDigest = await crypto.subtle.digest(
      {
        name: 'SHA-256',
      },
      myText
    );


    // Convert arraybuffer to hex
    let cacheKey = Array.from(new Uint8Array(cacheDigest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');


    // console.log("Get from cache", cacheKey, cacheKey in inMemoryCache, stringToHash);

    if (cacheKey in inMemoryCache) {
      const cacheObject = inMemoryCache[cacheKey];
      if (cacheObject.maxAge && cacheObject.maxAge < Date.now()) {
        delete inMemoryCache[cacheKey];
        return [null, CACHE_STATUS.MISS, null];
      }
      // console.log("Got from cache", inMemoryCache[cacheKey])
      return [cacheObject.responseBody, CACHE_STATUS.HIT, cacheKey];
    } else {
      return [null, CACHE_STATUS.MISS, null];
    }
  } catch (error) {
    console.log(error);
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
    // Does not support caching of streams
    return;
  }
  const stringToHash = `${JSON.stringify(requestBody)}-${url}`;
  const myText = new TextEncoder().encode(stringToHash);

  let cacheDigest = await crypto.subtle.digest(
    {
      name: 'SHA-256',
    },
    myText
  );

  // Convert arraybuffer to hex
  let cacheKey = Array.from(new Uint8Array(cacheDigest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // console.log("Put in cache", cacheKey, stringToHash);
  inMemoryCache[cacheKey] = {
    responseBody: JSON.stringify(responseBody),
    maxAge: cacheMaxAge,
  };
};

export const memoryCache = () => {
  return async (c: Context, next: any) => {
    // console.log("Cache Init")
    c.set('getFromCache', getFromCache);

    await next();

    let requestOptions = c.get('requestOptions');
    console.log("requestOptions", requestOptions);

    if (
      requestOptions &&
      Array.isArray(requestOptions) &&
      requestOptions.length > 0 &&
      requestOptions[0].requestParams.stream === (false || undefined)
    ) {
      requestOptions = requestOptions[0];
      // console.log("requestOptions", requestOptions);
      if (requestOptions.cacheMode === 'simple') {
        await putInCache(
          null,
          null,
          requestOptions.requestParams,
          await requestOptions.response.json(),
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
