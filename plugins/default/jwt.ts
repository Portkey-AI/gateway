import { PluginContext, PluginHandler, PluginParameters } from '../types';
import { jwtVerify, importJWK, JWTHeaderParameters, JWK } from 'jose';

interface JWKSCacheOptions {
  maxAge: number; // seconds
  clockTolerance?: number; // seconds
  maxTokenAge?: string; // 1d, 1h, 1m, 1s
}

async function getMatchingKey(token: string, jwks: any) {
  const header = JSON.parse(
    Buffer.from(token.split('.')[0], 'base64url').toString()
  ) as JWTHeaderParameters;
  if (!header.kid) return null;
  const jwk = (jwks.keys || []).find((key: JWK) => key.kid === header.kid);
  if (!jwk) return null;
  return importJWK(jwk, jwk.alg);
}

async function fetchAndCacheJWKS(
  jwksUri: string,
  cacheKey: string,
  maxAge: number,
  putInCacheWithValue?: Function
) {
  const res = await fetch(jwksUri);
  if (!res.ok) throw new Error(`Failed to fetch JWKS from ${jwksUri}`);
  const jwks = await res.json();
  await putInCacheWithValue?.(cacheKey, jwks, maxAge);
  return jwks;
}

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: string,
  options
) => {
  let error = null;
  let verdict = false;
  let data = null;

  try {
    const jwtAuthHeader = parameters.headerKey || 'Authorization';
    const jwksUri = parameters.jwksUri;
    if (!jwksUri) throw new Error('Missing JWKS URI');

    const authHeader = context.request?.headers?.[jwtAuthHeader];
    if (!authHeader) {
      return {
        error,
        verdict,
        data: {
          verdict: false,
          explanation: 'Missing authorization header',
        },
      };
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    const cacheKey = `jwks:${jwksUri}`;
    const cacheOptions: JWKSCacheOptions = {
      maxAge: parameters.cacheMaxAge || 86400, // 24h
      clockTolerance: parameters.clockTolerance || 5, // 5s
      maxTokenAge: parameters.maxTokenAge || '1d',
    };

    let jwks = await options?.getFromCacheByKey?.(cacheKey);
    if (!jwks) {
      jwks = await fetchAndCacheJWKS(
        jwksUri,
        cacheKey,
        cacheOptions.maxAge,
        options?.putInCacheWithValue
      );
    }

    let key = null;
    try {
      key = await getMatchingKey(token, jwks);
      if (!key) {
        jwks = await fetchAndCacheJWKS(
          jwksUri,
          cacheKey,
          cacheOptions.maxAge,
          options?.putInCacheWithValue
        );
        key = await getMatchingKey(token, jwks);
      }

      if (!key) {
        return {
          error,
          verdict,
          data: {
            verdict: false,
            explanation: 'No matching key found for kid',
          },
        };
      }
    } catch (e: any) {
      return {
        error: e,
        verdict,
        data: {
          verdict: false,
          explanation: `JWT validation error: ${e.message}`,
        },
      };
    }

    try {
      await jwtVerify(token, key, {
        clockTolerance: cacheOptions.clockTolerance,
        maxTokenAge: cacheOptions.maxTokenAge,
      });
      verdict = true;
      data = {
        verdict,
        explanation: 'JWT token validation succeeded',
      };
    } catch (e: any) {
      data = {
        verdict: false,
        explanation: `JWT validation error: ${e.message}`,
      };
    }
  } catch (e: any) {
    error = e;
    data = {
      verdict: false,
      explanation: `JWT validation error: ${e.message}`,
    };
  }
  return { error, verdict, data };
};
