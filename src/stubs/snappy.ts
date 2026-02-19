/**
 * Snappy replacement module using snappyjs
 * This module provides a compatible API for the native snappy module
 * and works in both Node.js and Cloudflare Workers environments
 */

import {
  compress as snappyjsCompress,
  uncompress as snappyjsUncompress,
} from 'snappyjs';

/**
 * Convert input to Uint8Array for snappyjs (which accepts ArrayBuffer | Uint8Array)
 */
function toUint8Array(
  input: Buffer | string | ArrayBuffer | Uint8Array
): Uint8Array {
  if (typeof input === 'string') {
    // Convert string to Uint8Array
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(input, 'utf8'));
    }
    // In Workers, use TextEncoder
    return new TextEncoder().encode(input);
  }
  if (Buffer.isBuffer(input)) {
    // Convert Buffer to Uint8Array
    return new Uint8Array(input);
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  // Already Uint8Array
  return input;
}

/**
 * Convert output to Buffer
 */
function toBufferOutput(output: Buffer | Uint8Array | ArrayBuffer): Buffer {
  if (Buffer.isBuffer(output)) {
    return output;
  }
  if (output instanceof ArrayBuffer) {
    return Buffer.from(output);
  }
  // Uint8Array
  return Buffer.from(output);
}

/**
 * Synchronous compression
 */
export function compressSync(
  input: Buffer | string | ArrayBuffer | Uint8Array
): Buffer {
  const uint8Input = toUint8Array(input);
  const compressed = snappyjsCompress(uint8Input);
  return toBufferOutput(compressed);
}

/**
 * Asynchronous compression (returns Promise)
 */
export function compress(
  input: Buffer | string | ArrayBuffer | Uint8Array
): Promise<Buffer> {
  return Promise.resolve(compressSync(input));
}

/**
 * Synchronous uncompression
 */
export function uncompressSync(compressed: Buffer): Buffer {
  // Convert Buffer to Uint8Array for snappyjs
  const uint8Compressed = new Uint8Array(compressed);
  const uncompressed = snappyjsUncompress(uint8Compressed);
  return toBufferOutput(uncompressed);
}

/**
 * Asynchronous uncompression (returns Promise)
 */
export function uncompress(compressed: Buffer): Promise<Buffer> {
  return Promise.resolve(uncompressSync(compressed));
}

// Default export for CommonJS compatibility
export default {
  compressSync,
  compress,
  uncompressSync,
  uncompress,
};
