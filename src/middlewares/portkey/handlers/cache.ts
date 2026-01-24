import { CACHE_STATUS, CacheKeyTypes, HEADER_KEYS } from '../globals';

const getCacheMaxAgeFromHeaders = (maxAgeHeader: string) => {
  try {
    const maxAgeFromHeader = maxAgeHeader.match(/max-age=(\d+)/)?.[1];
    if (maxAgeFromHeader) return parseInt(maxAgeFromHeader);
  } catch (err) {
    console.log('invalid maxAgeHeader', err);
  }
  return null;
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
  //forward request to Kreacher service binding
  let maxAge: number | null = null;
  const maxAgeHeader = requestHeaders[HEADER_KEYS.CACHE_CONTROL];
  if (cacheMaxAge) {
    maxAge = cacheMaxAge;
  } else if (maxAgeHeader) {
    maxAge = getCacheMaxAgeFromHeaders(maxAgeHeader);
  }

  const fetchBasePath = env.KREACHER_WORKER_BASEPATH;
  if (!fetchBasePath) {
    return [null, null, null];
  }
  const fetchUrl = `${fetchBasePath}/get`;
  //delete content-length header
  delete requestHeaders['content-length'];
  const fetchOptions = {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify({
      headers: requestHeaders,
      request: requestBody,
      url: url,
      organisationId,
      cacheMode: cacheMode ?? requestHeaders[HEADER_KEYS.CACHE],
      maxAge: maxAge,
    }),
  };

  try {
    const response = await env.kreacher.fetch(fetchUrl, fetchOptions);
    if (response.status === 200) {
      const responseFromKreacher = await response.json();

      // This is a hack to handle the existing cache records which stored the error message due to 200 status code.
      // It is currently not possible to invalidate these specific cache records so putting a check to return null for these records.
      // TODO: Remove this check after around 60 days.
      if (responseFromKreacher.data && responseFromKreacher.data.length < 100) {
        const parsedData = JSON.parse(responseFromKreacher.data);
        if (
          parsedData['html-message'] &&
          typeof parsedData['html-message'] === 'string'
        ) {
          return [null, CACHE_STATUS.MISS, responseFromKreacher.cacheKey];
        }
      }

      if (
        [CACHE_STATUS.HIT, CACHE_STATUS.SEMANTIC_HIT].includes(
          responseFromKreacher.status
        )
      ) {
        return [
          responseFromKreacher.data,
          responseFromKreacher.status,
          responseFromKreacher.cacheKey,
        ];
      } else {
        return [
          null,
          responseFromKreacher.status,
          responseFromKreacher.cacheKey,
        ];
      }
    } else {
      return [null, null, null];
    }
  } catch (error) {
    console.log('Error in fetching from kreacher worker', error);
    return [null, null, null];
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
  let maxAge: number | null = null;
  const maxAgeHeader = requestHeaders[HEADER_KEYS.CACHE_CONTROL];
  if (cacheMaxAge) {
    maxAge = cacheMaxAge;
  } else if (maxAgeHeader) {
    maxAge = getCacheMaxAgeFromHeaders(maxAgeHeader);
  }

  //forward request & response to Kreacher service binding
  const fetchBasePath = env.KREACHER_WORKER_BASEPATH;
  const fetchUrl = `${fetchBasePath}/put`;
  const fetchOptions = {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify({
      headers: requestHeaders,
      request: requestBody,
      response: responseBody,
      url: url,
      organisationId,
      cacheMode: cacheMode ?? requestHeaders[HEADER_KEYS.CACHE],
      maxAge: maxAge,
    }),
  };

  try {
    await env.kreacher.fetch(fetchUrl, fetchOptions);
  } catch (error) {
    console.log('Error in putting in kreacher worker', error);
  }
};

export function generateV2CacheKey({
  organisationId,
  workspaceId,
  cacheKeyType,
  key,
}: {
  organisationId: string;
  workspaceId?: string | null;
  cacheKeyType: CacheKeyTypes;
  key: string;
}) {
  let cacheKey = `${cacheKeyType}_${key}_`;
  if (organisationId) {
    cacheKey += `${CacheKeyTypes.ORGANISATION}_${organisationId}`;
  }
  if (workspaceId) {
    cacheKey += `${CacheKeyTypes.WORKSPACE}_${workspaceId}`;
  }
  return cacheKey;
}
