import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginHandlerOptions,
  PluginParameters,
} from '../types';
import {
  jwtVerify,
  importJWK,
  JWK,
  decodeJwt,
  decodeProtectedHeader,
  ProtectedHeaderParameters,
} from 'jose';

interface JWKSCacheOptions {
  maxAge: number; // seconds
  clockTolerance: number; // seconds
  maxTokenAge: string; // 1d, 1h, 1m, 1s
  algorithms: string[];
}

interface TokenIntrospectOptions {
  endpoint: string;
  contentType: string;
  cacheMaxAge?: number; // Cache validation results (optional)
}

interface ClaimValueConfig {
  values: string | string[];
  matchType?: 'exact' | 'contains' | 'containsAll' | 'regex';
}

interface ValidationResult {
  valid: boolean;
  failed?: string[];
  missing?: string[];
  mismatched?: string[];
}

interface ValidationDetails {
  signatureValid: boolean;
  requiredClaims?: ValidationResult;
  claimValues?: ValidationResult;
  headerPayloadMatch?: ValidationResult;
}

async function getMatchingKey(
  header: ProtectedHeaderParameters,
  jwks: { keys?: JWK[] },
  backupAlg: string
) {
  if (!header.kid) return null;
  const jwk = (jwks.keys || []).find((key: JWK) => key.kid === header.kid);
  if (!jwk) return null;
  const algorithm = jwk.alg || backupAlg;
  return importJWK(jwk, algorithm);
}

async function fetchAndCacheJWKS(
  jwksUri: string,
  cacheKey: string,
  maxAge: number,
  pluginOptions: PluginHandlerOptions
) {
  const res = await pluginOptions.externalServiceFetch(jwksUri);
  if (!res.ok) throw new Error(`Failed to fetch JWKS from ${jwksUri}`);
  const jwks = await res.json();
  await pluginOptions.putInCacheWithValue(cacheKey, jwks, maxAge);
  return jwks;
}

/**
 * Validates token using external token introspection endpoint
 */
async function validateTokenViaIntrospect(
  token: string,
  options: TokenIntrospectOptions,
  pluginOptions: PluginHandlerOptions
): Promise<{
  valid: boolean;
  payload?: Record<string, unknown>;
  error?: string;
}> {
  try {
    const method = 'POST';

    const headers: Record<string, string> = {
      'Content-Type': options.contentType,
    };

    const fetchOptions: RequestInit = {
      method,
      headers,
      body: JSON.stringify({ token }),
    };

    const res = await pluginOptions.externalServiceFetch(
      options.endpoint,
      fetchOptions
    );

    if (!res.ok) {
      return {
        valid: false,
        error: `Endpoint validation failed with status ${res.status}`,
      };
    }

    const responseData = (await res.json()) as Record<string, unknown>;

    // Check if response indicates token is valid
    // Support common response formats:
    // { active: true, ... } - OAuth introspection format
    // { valid: true, ... }
    // { sub: "user123", ... } - User info format (presence indicates validity)
    const isValid =
      typeof responseData.active !== 'undefined'
        ? responseData.active === true
        : responseData.valid === true ||
          (responseData.sub !== undefined && responseData.sub !== null);

    return {
      valid: isValid,
      payload: responseData,
      error: isValid ? undefined : 'Token validation failed',
    };
  } catch (e) {
    return {
      valid: false,
      error: `Endpoint validation error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * Validates if required claims are present in the payload
 */
function validateRequiredClaims(
  payload: Record<string, unknown>,
  requiredClaims: string[]
): ValidationResult {
  const missing: string[] = [];

  for (const claim of requiredClaims) {
    if (
      !(claim in payload) ||
      payload[claim] === undefined ||
      payload[claim] === null
    ) {
      missing.push(claim);
    }
  }

  return {
    valid: missing.length === 0,
    missing: missing.length > 0 ? missing : undefined,
  };
}

/**
 * Helper to normalize values to array for comparison
 * @param value - The value to normalize
 * @param claimName - The name of the claim (used to apply special handling for 'scope')
 */
function normalizeToArray(value: unknown, claimName?: string): string[] {
  if (Array.isArray(value)) {
    return value.map((v: unknown) => String(v));
  }
  if (typeof value === 'string') {
    // Only split by spaces for OAuth 'scope' claim (RFC 6749)
    // Other string claims should be treated as single values
    if (claimName?.toLowerCase() === 'scope') {
      return value.split(/\s+/).filter((v) => v.length > 0);
    }
    return [value];
  }
  return [String(value)];
}

/**
 * Validates claim values match expected values
 */
function validateClaimValues(
  payload: Record<string, unknown>,
  claimValues: Record<string, ClaimValueConfig>
): ValidationResult {
  const failed: string[] = [];

  for (const [claimName, config] of Object.entries(claimValues)) {
    const payloadValue = payload[claimName];

    if (payloadValue === undefined || payloadValue === null) {
      failed.push(`${claimName} (missing)`);
      continue;
    }

    const expectedValues = Array.isArray(config.values)
      ? config.values
      : [config.values];
    const matchType = config.matchType || 'exact';
    let matches = false;

    switch (matchType) {
      case 'exact': {
        // For exact match, check if payload value exactly equals any expected value
        const normalizedPayload = normalizeToArray(payloadValue, claimName);
        // Only works for single-value (string) payloads
        if (normalizedPayload.length === 1 && expectedValues.length === 1) {
          matches = normalizedPayload[0] === String(expectedValues[0]);
        } else {
          // Arrays not supported for exact match
          matches = false;
        }
        break;
      }

      case 'contains': {
        // Check if payload contains at least one of the expected values (OR logic)
        const payloadArray = normalizeToArray(payloadValue, claimName);
        matches = expectedValues.some((expected) =>
          payloadArray.some((val) => val.includes(String(expected)))
        );
        break;
      }

      case 'containsAll': {
        // Check if payload contains ALL of the expected values (AND logic)
        const payloadValues = normalizeToArray(payloadValue, claimName);
        matches = expectedValues.every((expected) =>
          payloadValues.some((val) => val.includes(String(expected)))
        );
        break;
      }

      case 'regex': {
        // Test payload value against regex patterns
        matches = expectedValues.some((pattern) => {
          try {
            const regex = new RegExp(pattern);
            const valuesToTest = normalizeToArray(payloadValue, claimName);
            return valuesToTest.some((val) => regex.test(val));
          } catch (e) {
            return false;
          }
        });
        break;
      }
    }

    if (!matches) {
      failed.push(claimName);
    }
  }

  return {
    valid: failed.length === 0,
    failed: failed.length > 0 ? failed : undefined,
  };
}

/**
 * Validates that header values match payload values for specified keys
 */
function validateHeaderPayloadMatch(
  header: ProtectedHeaderParameters,
  payload: Record<string, unknown>,
  keysToMatch: string[]
): ValidationResult {
  const mismatched: string[] = [];

  for (const key of keysToMatch) {
    const headerValue = (header as Record<string, unknown>)[key];
    const payloadValue = payload[key];

    if (headerValue !== payloadValue) {
      mismatched.push(key);
    }
  }

  return {
    valid: mismatched.length === 0,
    mismatched: mismatched.length > 0 ? mismatched : undefined,
  };
}

/**
 * Extracts claims from JWT payload and formats them for context injection
 */
function extractClaimsToContext(
  payload: Record<string, unknown>,
  claimsToExtract: string[],
  prefix: string = 'x-jwt-'
): Record<string, string> {
  const extracted: Record<string, string> = {};

  for (const claim of claimsToExtract) {
    const value = payload[claim];
    if (value !== undefined && value !== null) {
      const headerKey = `${prefix}${claim}`;
      // Convert arrays and objects to JSON strings
      if (Array.isArray(value)) {
        extracted[headerKey] = value.join(',');
      } else if (typeof value === 'object') {
        extracted[headerKey] = JSON.stringify(value);
      } else {
        extracted[headerKey] = String(value);
      }
    }
  }

  return extracted;
}

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType,
  pluginOptions: PluginHandlerOptions
) => {
  let error = null;
  let verdict = false;
  let data = null;

  try {
    const jwtAuthHeader = parameters.headerKey || 'Authorization';
    const jwks = parameters.jwks;
    const jwksUri = parameters.jwksUri;
    const introspectEndpoint = parameters.introspectEndpoint;
    const introspectContentType =
      parameters.introspectContentType || 'application/x-www-form-urlencoded';

    // Either jwks, jwksUri, or introspectEndpoint must be provided
    if (!jwks && !jwksUri && !introspectEndpoint) {
      throw new Error(
        'Either jwks, jwksUri, or introspectEndpoint must be provided'
      );
    }

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
    let payload: Record<string, unknown>;
    let header: ProtectedHeaderParameters;

    const validations: ValidationDetails = {
      signatureValid: true,
    };

    // Choose validation method based on configuration
    if (introspectEndpoint) {
      // Validate using token introspection endpoint
      const endpointOptions: TokenIntrospectOptions = {
        endpoint: introspectEndpoint,
        contentType: introspectContentType,
        cacheMaxAge: parameters.introspectCacheMaxAge,
      };

      // Extract clock tolerance for consistent time-based validation
      const clockTolerance =
        typeof parameters.clockTolerance === 'number'
          ? parameters.clockTolerance
          : 5; // Default 5 seconds

      // Check cache if enabled
      let validationResult = null;
      const cacheKey = `jwt:validation:${token}`;
      if (endpointOptions.cacheMaxAge) {
        validationResult = await pluginOptions.getFromCacheByKey(cacheKey);

        // Verify cached token hasn't expired (with clock tolerance)
        if (validationResult?.valid && validationResult.payload?.exp) {
          const exp = Number(validationResult.payload.exp);
          const now = Math.floor(Date.now() / 1000);
          if (!isNaN(exp) && exp + clockTolerance <= now) {
            // Token expired (including clock tolerance) since caching, invalidate
            validationResult = null;
          }
        }
      }

      if (!validationResult) {
        validationResult = await validateTokenViaIntrospect(
          token,
          endpointOptions,
          pluginOptions
        );

        // Cache validation result if enabled
        if (endpointOptions.cacheMaxAge && validationResult.valid) {
          let cacheTTL = endpointOptions.cacheMaxAge;

          // Verify cache TTL doesn't exceed token expiration (with clock tolerance)
          if (validationResult.payload?.exp) {
            const exp = Number(validationResult.payload.exp);
            if (!isNaN(exp)) {
              const now = Math.floor(Date.now() / 1000);
              // Time until token expires, considering clock tolerance
              const timeUntilExpiry = exp + clockTolerance - now;

              // Use the minimum of configured TTL and time until token expires
              if (timeUntilExpiry > 0) {
                cacheTTL = Math.min(cacheTTL, timeUntilExpiry);
              } else {
                // Token already expired (with clock tolerance), don't cache
                cacheTTL = 0;
              }
            }
          }

          if (cacheTTL > 0) {
            await pluginOptions.putInCacheWithValue(
              cacheKey,
              validationResult,
              cacheTTL
            );
          }
        }
      }

      if (!validationResult.valid) {
        return {
          error,
          verdict,
          data: {
            verdict: false,
            explanation: validationResult.error || 'Token validation failed',
            validations: {
              signatureValid: false,
            },
          },
        };
      }

      // Use payload from endpoint response
      payload = validationResult.payload || {};

      // Validate time-based claims (with clock tolerance)
      const now = Math.floor(Date.now() / 1000);

      // Check token expiration if exp claim is present (with clock tolerance)
      if (payload.exp) {
        const exp = Number(payload.exp);
        if (!isNaN(exp) && exp + clockTolerance <= now) {
          return {
            error,
            verdict,
            data: {
              verdict: false,
              explanation: 'Token has expired',
              validations: {
                signatureValid: false,
              },
            },
          };
        }
      }

      // Check not-before if nbf claim is present (with clock tolerance)
      if (payload.nbf) {
        const nbf = Number(payload.nbf);
        if (!isNaN(nbf) && nbf - clockTolerance > now) {
          return {
            error,
            verdict,
            data: {
              verdict: false,
              explanation: 'Token not yet valid',
              validations: {
                signatureValid: false,
              },
            },
          };
        }
      }

      // Decode header for additional validations if needed
      try {
        header = decodeProtectedHeader(token);
      } catch (e) {
        header = {} as ProtectedHeaderParameters;
      }
    } else {
      // Original JWKS validation
      if (!jwks && !jwksUri)
        throw new Error('Missing JWKS or JWKS URI for validation');

      payload = decodeJwt(token);
      header = decodeProtectedHeader(token);

      const cacheOptions: JWKSCacheOptions = {
        maxAge: parameters.cacheMaxAge || 86400, // 24h
        clockTolerance: parameters.clockTolerance || 5, // 5s
        maxTokenAge: parameters.maxTokenAge || '1d',
        algorithms:
          Array.isArray(parameters.algorithms) && parameters.algorithms.length
            ? parameters.algorithms
            : ['RS256'],
      };

      let jwksData = jwks;
      if (!jwksData && jwksUri) {
        // Fetch from URI if not provided inline
        const cacheKey = `jwks:${jwksUri}`;
        jwksData = await pluginOptions.getFromCacheByKey(cacheKey);
        if (!jwksData) {
          jwksData = await fetchAndCacheJWKS(
            jwksUri,
            cacheKey,
            cacheOptions.maxAge,
            pluginOptions
          );
        }
      }

      let key = null;
      try {
        const backupAlg = cacheOptions.algorithms?.[0];
        key = await getMatchingKey(header, jwksData, backupAlg);
        if (!key && jwksUri) {
          // Retry by fetching fresh JWKS from URI (only if using jwksUri)
          const cacheKey = `jwks:${jwksUri}`;
          jwksData = await fetchAndCacheJWKS(
            jwksUri,
            cacheKey,
            cacheOptions.maxAge,
            pluginOptions
          );
          key = await getMatchingKey(header, jwksData, backupAlg);
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
      } catch (e) {
        return {
          error: e,
          verdict,
          data: {
            verdict: false,
            explanation: `JWT validation error: ${e instanceof Error ? e.message : String(e)}`,
          },
        };
      }

      // Verify JWT signature and standard time-based claims
      try {
        const verifyOptions: Record<string, unknown> = {
          clockTolerance: cacheOptions.clockTolerance,
          algorithms: cacheOptions.algorithms,
        };

        if (cacheOptions.maxTokenAge && payload.iat) {
          verifyOptions.maxTokenAge = cacheOptions.maxTokenAge;
        }

        await jwtVerify(token, key, verifyOptions);
      } catch (e) {
        return {
          error: e,
          verdict,
          data: {
            verdict: false,
            explanation: `JWT signature validation error: ${e instanceof Error ? e.message : String(e)}`,
            validations: {
              signatureValid: false,
            },
          },
        };
      }
    }

    const failedValidations: string[] = [];

    // Validate required claims
    if (parameters.requiredClaims && Array.isArray(parameters.requiredClaims)) {
      validations.requiredClaims = validateRequiredClaims(
        payload,
        parameters.requiredClaims
      );
      if (!validations.requiredClaims.valid) {
        failedValidations.push(
          `Missing required claims: ${validations.requiredClaims.missing?.join(', ')}`
        );
      }
    }

    // Validate claim values
    if (parameters.claimValues && typeof parameters.claimValues === 'object') {
      validations.claimValues = validateClaimValues(
        payload,
        parameters.claimValues
      );
      if (!validations.claimValues.valid) {
        failedValidations.push(
          `Invalid claim values: ${validations.claimValues.failed?.join(', ')}`
        );
      }
    }

    // Validate header-payload match (only if header was decoded successfully)
    if (
      parameters.headerPayloadMatch &&
      Array.isArray(parameters.headerPayloadMatch) &&
      header
    ) {
      validations.headerPayloadMatch = validateHeaderPayloadMatch(
        header,
        payload,
        parameters.headerPayloadMatch
      );
      if (!validations.headerPayloadMatch.valid) {
        failedValidations.push(
          `Header-payload mismatch: ${validations.headerPayloadMatch.mismatched?.join(', ')}`
        );
      }
    }

    // Determine final verdict
    verdict = failedValidations.length === 0;

    // Extract claims to context if configured
    let transformedData = undefined;
    let transformed = false;

    if (
      verdict &&
      parameters.extractClaims &&
      Array.isArray(parameters.extractClaims) &&
      parameters.extractClaims.length > 0
    ) {
      const claimPrefix =
        typeof parameters.claimPrefix === 'string'
          ? parameters.claimPrefix
          : 'x-jwt-';

      const extractedClaims = extractClaimsToContext(
        payload,
        parameters.extractClaims,
        claimPrefix
      );

      transformedData = {
        headers: extractedClaims,
      };
      transformed = true;
    }

    data = {
      verdict,
      explanation: verdict
        ? 'JWT token validation succeeded'
        : `JWT validation failed: ${failedValidations.join('; ')}`,
      validations,
    };

    return { error, verdict, data, transformedData, transformed };
  } catch (e) {
    error = e;
    data = {
      verdict: false,
      explanation: `JWT validation error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  return { error, verdict, data };
};
