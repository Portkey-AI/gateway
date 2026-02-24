import { ServerConfig } from '../types/mcp';
import { createLogger } from '../../shared/utils/logger';

const logger = createLogger('mcp/headers');

/**
 * Protected headers that should NEVER be forwarded from client requests
 * to prevent malicious clients from overriding gateway authentication
 *
 * This provides defense against security vulnerabilities where a malicious
 * client could send headers like 'authorization' or 'x-api-key' to override
 * the gateway's configured credentials.
 */
export const PROTECTED_HEADERS = new Set([
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-portkey-api-key',
  'api-key',
  'apikey',
  'x-auth-token',
  'x-access-token',
  // User identity headers - prevent client spoofing
  'x-user-claims',
  'x-user-jwt',
]);

/**
 * Extract headers to forward from incoming request based on server configuration
 */
export function extractHeadersToForward(
  incomingHeaders: Record<string, string>,
  forwardConfig?: ServerConfig['forwardHeaders']
): Record<string, string> | undefined {
  if (!forwardConfig) return undefined;

  const result: Record<string, string> = {};

  // Normalize incoming headers to lowercase for case-insensitive matching
  // Track original casing to preserve it in forwarded headers
  const normalizedHeaders: Record<
    string,
    { value: string; originalKey: string }
  > = {};
  for (const [key, value] of Object.entries(incomingHeaders)) {
    normalizedHeaders[key.toLowerCase()] = { value, originalKey: key };
  }

  // Normalize array form to object form for consistent handling
  const config = Array.isArray(forwardConfig)
    ? { mode: 'allowlist' as const, headers: forwardConfig }
    : forwardConfig;

  if (config.mode === 'allowlist') {
    // Allowlist mode: forward only specified headers (excluding protected ones)
    for (const headerName of config.headers) {
      const normalizedName = headerName.toLowerCase();

      // Security: Never forward protected headers
      if (PROTECTED_HEADERS.has(normalizedName)) {
        logger.warn(
          `Blocked attempt to forward protected header: ${headerName}`
        );
        continue;
      }

      const headerData = normalizedHeaders[normalizedName];
      if (headerData) {
        // Use original casing from incoming request
        result[headerData.originalKey] = headerData.value;
        logger.debug(`Forwarding header: ${headerData.originalKey}`);
      }
    }
  } else {
    // all-except mode: forward all headers except specified ones
    // Combine user blocklist with protected headers
    const blocklist = new Set([
      ...config.headers.map((h) => h.toLowerCase()),
      ...PROTECTED_HEADERS,
    ]);
    for (const [key, headerData] of Object.entries(normalizedHeaders)) {
      if (!blocklist.has(key)) {
        // Use original casing from incoming request
        result[headerData.originalKey] = headerData.value;
        logger.debug(
          `Forwarding header (all-except): ${headerData.originalKey}`
        );
      } else if (PROTECTED_HEADERS.has(key)) {
        logger.debug(`Skipping protected header: ${key}`);
      }
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Get all headers from a Hono context request
 */
export function getAllHeadersFromRequest(request: {
  raw?: { headers?: Headers };
}): Record<string, string> {
  const headers: Record<string, string> = {};

  try {
    // Access the raw request headers safely
    const rawHeaders = request?.raw?.headers;

    if (rawHeaders && typeof rawHeaders.forEach === 'function') {
      rawHeaders.forEach((value: string, key: string) => {
        headers[key] = value;
      });
    }
  } catch (error) {
    logger.warn('Failed to extract headers from request', error);
  }

  return headers;
}
