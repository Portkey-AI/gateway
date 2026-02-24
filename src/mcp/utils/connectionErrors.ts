/**
 * @file src/mcp/utils/connectionErrors.ts
 * Shared utilities for detecting connection errors
 */

/**
 * Patterns that indicate a connection/network error worth retrying
 */
const CONNECTION_ERROR_PATTERNS = [
  // Node.js/system errors
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENOTFOUND',

  // Generic connection errors
  'socket hang up',
  'connection closed',
  'connection reset',
  'connection refused',
  'connection timed out',

  // Transport/protocol errors
  'transport closed',
  'transport error',
  'disconnected',

  // Fetch/network errors
  'network error',
  'fetch failed',
  'network request failed',

  // TLS errors
  'ssl',
  'certificate',
] as const;

/**
 * Check if an error is likely a connection/network error
 *
 * Used to determine if an operation should be retried with a fresh connection.
 *
 * @param error - The error to check
 * @returns true if the error appears to be a connection error
 */
export function isConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return CONNECTION_ERROR_PATTERNS.some((pattern) =>
    message.includes(pattern.toLowerCase())
  );
}

/**
 * Check if an error is a timeout error specifically
 */
export function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('etimedout') ||
    message.includes('timeout') ||
    message.includes('timed out')
  );
}
