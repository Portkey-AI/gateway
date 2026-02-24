import {
  ANTHROPIC,
  COHERE,
  GOOGLE,
  GOOGLE_VERTEX_AI,
  PERPLEXITY_AI,
  DEEPINFRA,
  SAMBANOVA,
  BEDROCK,
} from './globals';
import { Params } from './types/requestBody';
import { Environment } from './utils/env';

export const getStreamModeSplitPattern = (
  proxyProvider: string,
  requestURL: string
) => {
  let splitPattern: SplitPatternType = '\n\n';

  if (proxyProvider === ANTHROPIC && requestURL.endsWith('/complete')) {
    splitPattern = '\r\n\r\n';
  }

  if (proxyProvider === COHERE) {
    splitPattern = requestURL.includes('/chat') ? '\n\n' : '\n';
  }

  if (proxyProvider === GOOGLE) {
    splitPattern = '\r\n';
  }

  // In Vertex Anthropic and LLama have \n\n as the pattern only Gemini has \r\n\r\n
  if (
    proxyProvider === GOOGLE_VERTEX_AI &&
    requestURL.includes('/publishers/google')
  ) {
    splitPattern = '\r\n\r\n';
  }

  if (proxyProvider === PERPLEXITY_AI) {
    splitPattern = '\r\n\r\n';
  }

  if (proxyProvider === DEEPINFRA) {
    splitPattern = '\n';
  }

  if (proxyProvider === SAMBANOVA) {
    splitPattern = '\n';
  }

  return splitPattern;
};
export type SplitPatternType = '\n\n' | '\r\n\r\n' | '\n' | '\r\n';

export const getStreamingMode = (
  reqBody: Params,
  provider: string,
  requestUrl: string
) => {
  if (
    [GOOGLE, GOOGLE_VERTEX_AI].includes(provider) &&
    requestUrl.indexOf('stream') > -1
  ) {
    return true;
  }
  if (
    provider === BEDROCK &&
    (requestUrl.indexOf('invoke-with-response-stream') > -1 ||
      requestUrl.indexOf('converse-stream') > -1)
  ) {
    return true;
  }
  return !!reqBody?.stream;
};

export function convertKeysToCamelCase(
  obj: Record<string, any>,
  parentKeysToPreserve: string[] = []
): Record<string, any> {
  if (typeof obj !== 'object' || obj === null) {
    return obj; // Return unchanged for non-objects or null
  }

  if (Array.isArray(obj)) {
    // If it's an array, recursively convert each element
    return obj.map((item) =>
      convertKeysToCamelCase(item, parentKeysToPreserve)
    );
  }

  return Object.keys(obj).reduce((result: any, key: string) => {
    const value = obj[key];
    const camelCaseKey = toCamelCase(key);
    const isParentKeyToPreserve = parentKeysToPreserve.includes(key);
    if (typeof value === 'object' && !isParentKeyToPreserve) {
      // Recursively convert child objects
      result[camelCaseKey] = convertKeysToCamelCase(
        value,
        parentKeysToPreserve
      );
    } else {
      // Add key in camelCase to the result
      result[camelCaseKey] = value;
    }

    return result;
  }, {});

  function toCamelCase(snakeCase: string): string {
    return snakeCase.replace(/(_\w)/g, (match) => match[1].toUpperCase());
  }
}

export const parseStringToArray = (value?: string) => {
  if (!value) {
    return [];
  }
  const parts = value.split(',').map((val) => val.trim());
  return parts;
};

export const getCORSValues = () => {
  const isCorsEnabled = Environment({}).ENABLE_CORS === 'true';

  const allowedOrigins = parseStringToArray(
    Environment({}).CORS_ALLOWED_ORIGINS
  );
  const allowedMethods = parseStringToArray(
    Environment({}).CORS_ALLOWED_METHODS
  );
  const allowedHeaders = parseStringToArray(
    Environment({}).CORS_ALLOWED_HEADERS
  );
  const allowedExposeHeaders = parseStringToArray(
    Environment({}).CORS_ALLOWED_EXPOSE_HEADERS
  );

  return {
    allowedOrigins,
    allowedMethods,
    allowedHeaders,
    allowedExposeHeaders,
    isCorsEnabled,
  };
};
const { allowedMethods, allowedHeaders, allowedExposeHeaders } =
  getCORSValues();

export const setCorsHeaders = (response: Response, origin: string) => {
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set(
    'Access-Control-Allow-Methods',
    allowedMethods.join(',')
  );
  response.headers.set(
    'Access-Control-Allow-Headers',
    allowedHeaders.join(',')
  );
  response.headers.set(
    'Access-Control-Expose-Headers',
    allowedExposeHeaders.join(',')
  );
};

export async function computeSHA256(data: string) {
  const encoder = new TextEncoder();
  const dataArray = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataArray);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
