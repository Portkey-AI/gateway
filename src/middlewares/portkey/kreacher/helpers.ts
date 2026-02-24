import { PORTKEY_HEADER_KEYS } from '../globals';

const DEFAULT_CACHE_AGE = 604800; // 7 days
const MIN_CACHE_AGE = 60; // 1 minute
const MAX_CACHE_AGE = 7776000; // 90 days

const allowedHeadersForCache = [PORTKEY_HEADER_KEYS.METADATA];

const cacheNamespaceHeader = PORTKEY_HEADER_KEYS.CACHE_NAME_SPACE;

export const getHeaderObj = (
  headers: Record<string, any>,
  cacheDataUrl: string,
  incomingRequestBody: Record<string, any>
) => {
  let maxAge = incomingRequestBody.maxAge;
  if (!maxAge) {
    maxAge = DEFAULT_CACHE_AGE;
  }

  if (maxAge < MIN_CACHE_AGE || maxAge > MAX_CACHE_AGE) {
    maxAge = DEFAULT_CACHE_AGE;
  }

  const proxyMode = headers[PORTKEY_HEADER_KEYS.MODE];
  let cacheMode = headers[PORTKEY_HEADER_KEYS.CACHE] || 'false';
  if (
    cacheMode === 'semantic' &&
    !isOpenAICompletion(proxyMode, cacheDataUrl)
  ) {
    cacheMode = 'simple';
  }

  if (cacheMode === 'true') {
    cacheMode = 'simple';
  }

  const metaHeader = headers[PORTKEY_HEADER_KEYS.METADATA]
    ? JSON.parse(headers[PORTKEY_HEADER_KEYS.METADATA])
    : null;

  return {
    proxyMode,
    cacheMode,
    invalidateCache:
      headers[PORTKEY_HEADER_KEYS.CACHE_REFRESH]?.toLowerCase() || null,
    maxAge,
    metaJSONString: headers[PORTKEY_HEADER_KEYS.METADATA],
    meta: metaHeader,
  };
};

export const generateHash = async (stringToHash: string) => {
  const myText = new TextEncoder().encode(stringToHash);
  const myDigest = await crypto.subtle.digest(
    {
      name: 'SHA-256',
    },
    myText
  );

  const byteArray = Array.from(new Uint8Array(myDigest));
  const hexCodes = byteArray.map((value) => {
    const hexCode = value.toString(16);
    const paddedHexCode = hexCode.padStart(2, '0');
    return paddedHexCode;
  });

  return hexCodes.join('');
};

export const getHeadersForCache = (headersArr: any) => {
  if (typeof headersArr === 'string') {
    headersArr = JSON.parse(headersArr);
  }

  if (headersArr.hasOwnProperty(cacheNamespaceHeader)) {
    return headersArr[cacheNamespaceHeader];
  } else {
    for (const header in headersArr) {
      if (!allowedHeadersForCache.includes(header)) {
        delete headersArr[header];
      }
    }
    return headersArr;
  }
};

export const getCacheKey = async (body: Record<string, any>) => {
  const keyPrefix = `OUTPUT_`;
  const headersForCache = getHeadersForCache(cloneJ(body.headers));
  const stringToHash = `${body.organisationId}${body.url}${JSON.stringify(
    body.request
  )}${JSON.stringify(headersForCache)}`;
  const hash = await generateHash(stringToHash);
  return `${keyPrefix}${hash}`;
};

export const cloneJ = (obj: Record<string, any>) => {
  return JSON.parse(JSON.stringify(obj));
};

function isOpenAICompletion(proxyMode: string, cacheDataUrl: string) {
  return proxyMode == 'proxy openai' && cacheDataUrl.endsWith('completions');
}

export const separatePromptAndMeta = (
  proxyMode: string | null,
  endpoint: string,
  requestObj: Record<string, any>
): { prompt: string | undefined; params: Record<string, any> | null } => {
  const isChatCompletion =
    endpoint.includes('/chat/completions') || endpoint === 'chatComplete';
  const isCompletion =
    (endpoint.includes('/completions') || endpoint === 'complete') &&
    !endpoint.includes('/chat/completions');

  if (isChatCompletion && requestObj.messages?.length) {
    const params = { ...requestObj };
    const messages = params.messages;
    delete params.messages;

    // Skip the first message (system prompt) to avoid false semantic matches
    let prompt = '';
    messages.slice(1).forEach((msg: any) => {
      const content =
        typeof msg.content === 'string'
          ? msg.content
          : JSON.stringify(msg.content);
      prompt += content;
      prompt += '\n###\n';
    });

    return { prompt, params };
  }

  if (isCompletion && requestObj.prompt) {
    const params = { ...requestObj };
    const prompt = String(params.prompt);
    delete params.prompt;
    return { prompt, params };
  }

  return { prompt: undefined, params: null };
};
