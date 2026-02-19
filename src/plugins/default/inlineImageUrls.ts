import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginHandlerOptions,
  PluginParameters,
} from '../types';

interface ImageUrlContent {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: string;
    mime_type?: string;
  };
}

interface ContentPart {
  type: string;
  text?: string;
  image_url?: {
    url: string;
    detail?: string;
    mime_type?: string;
  };
  [key: string]: any;
}

interface Message {
  role: string;
  content: string | ContentPart[];
  [key: string]: any;
}

interface InlineImageUrlsParameters extends PluginParameters {
  /** Maximum image size in bytes (default: 20MB) */
  maxSizeBytes?: number;
  /** Timeout for fetching each image in milliseconds (default: 30000) */
  timeoutMs?: number;
  /** List of providers to apply this transformation to (default: all providers) */
  providers?: string[];
  /** Whether to fail the request if any image fetch fails (default: false) */
  failOnError?: boolean;
}

const DEFAULT_MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Detects MIME type from URL extension or Content-Type header
 */
function getMimeTypeFromUrl(url: string): string {
  const extensionMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    tiff: 'image/tiff',
    tif: 'image/tiff',
  };

  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const extension = pathname.split('.').pop()?.toLowerCase();
    if (extension && extensionMap[extension]) {
      return extensionMap[extension];
    }
  } catch {
    // Invalid URL, fall through to default
  }

  return 'image/jpeg'; // Default fallback
}

/**
 * Checks if a URL is an external HTTP/HTTPS URL that needs to be fetched
 */
function isExternalImageUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

/**
 * Checks if a URL is already inline data (base64)
 */
function isInlineDataUrl(url: string): boolean {
  return url.startsWith('data:');
}

/**
 * Checks if a URL is a Google Cloud Storage URL
 */
function isGcsUrl(url: string): boolean {
  return url.startsWith('gs://');
}

/**
 * Fetches an image from a URL and converts it to a base64 data URL
 */
async function fetchImageAsBase64(
  url: string,
  options: PluginHandlerOptions,
  maxSizeBytes: number,
  timeoutMs: number
): Promise<{ dataUrl: string; mimeType: string; sizeBytes: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await options.externalServiceFetch(url, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch image: ${response.status} ${response.statusText}`
      );
    }

    // Check content length if available
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > maxSizeBytes) {
      throw new Error(
        `Image size (${contentLength} bytes) exceeds maximum allowed size (${maxSizeBytes} bytes)`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const sizeBytes = arrayBuffer.byteLength;

    if (sizeBytes > maxSizeBytes) {
      throw new Error(
        `Image size (${sizeBytes} bytes) exceeds maximum allowed size (${maxSizeBytes} bytes)`
      );
    }

    // Get MIME type from response header or URL
    let mimeType = response.headers.get('content-type')?.split(';')[0].trim();
    if (!mimeType || !mimeType.startsWith('image/')) {
      mimeType = getMimeTypeFromUrl(url);
    }

    // Convert to base64
    const uint8Array = new Uint8Array(arrayBuffer);
    let binaryString = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binaryString += String.fromCharCode(uint8Array[i]);
    }
    const base64 = btoa(binaryString);
    const dataUrl = `data:${mimeType};base64,${base64}`;

    return { dataUrl, mimeType, sizeBytes };
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Image fetch timed out after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  }
}

/**
 * Processes a single content part, converting external image URLs to base64
 */
async function processContentPart(
  part: ContentPart,
  options: PluginHandlerOptions,
  maxSizeBytes: number,
  timeoutMs: number
): Promise<{ part: ContentPart; converted: boolean; error?: Error }> {
  if (part.type !== 'image_url' || !part.image_url?.url) {
    return { part, converted: false };
  }

  const url = part.image_url.url;

  // Skip if already inline data or GCS URL
  if (isInlineDataUrl(url) || isGcsUrl(url)) {
    return { part, converted: false };
  }

  // Only process external HTTP/HTTPS URLs
  if (!isExternalImageUrl(url)) {
    return { part, converted: false };
  }

  try {
    const { dataUrl, mimeType } = await fetchImageAsBase64(
      url,
      options,
      maxSizeBytes,
      timeoutMs
    );

    const convertedPart: ContentPart = {
      ...part,
      image_url: {
        ...part.image_url,
        url: dataUrl,
        // Preserve or set mime_type
        mime_type: part.image_url.mime_type || mimeType,
      },
    };

    return { part: convertedPart, converted: true };
  } catch (error: any) {
    return { part, converted: false, error };
  }
}

/**
 * Processes all messages in the request, converting external image URLs to base64
 */
async function processMessages(
  messages: Message[],
  options: PluginHandlerOptions,
  maxSizeBytes: number,
  timeoutMs: number,
  failOnError: boolean
): Promise<{
  messages: Message[];
  totalConverted: number;
  errors: Array<{ url: string; error: string }>;
}> {
  let totalConverted = 0;
  const errors: Array<{ url: string; error: string }> = [];
  const processedMessages: Message[] = [];

  for (const message of messages) {
    if (
      typeof message.content === 'string' ||
      !Array.isArray(message.content)
    ) {
      processedMessages.push(message);
      continue;
    }

    // Process content parts in parallel for each message
    const results = await Promise.all(
      message.content.map((part) =>
        processContentPart(part, options, maxSizeBytes, timeoutMs)
      )
    );

    const newContent: ContentPart[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const originalPart = message.content[i] as ImageUrlContent;

      if (result.error) {
        errors.push({
          url: originalPart.image_url?.url || 'unknown',
          error: result.error.message,
        });
        if (failOnError) {
          throw result.error;
        }
      }

      if (result.converted) {
        totalConverted++;
      }

      newContent.push(result.part);
    }

    processedMessages.push({
      ...message,
      content: newContent,
    });
  }

  return { messages: processedMessages, totalConverted, errors };
}

/**
 * Plugin handler that converts external image URLs to base64 inline data.
 *
 * This is useful for environments with VPC Service Controls (VPC-SC) where
 * the LLM provider (e.g., Vertex AI) cannot fetch external URLs directly.
 * By converting URLs to base64 in the gateway, the images are sent inline
 * with the request, bypassing the need for the provider to make external calls.
 *
 * @example
 * // Hook configuration
 * {
 *   "beforeRequestHooks": [{
 *     "type": "mutator",
 *     "id": "inline-images",
 *     "checks": [{
 *       "id": "default.inlineImageUrls",
 *       "parameters": {
 *         "providers": ["google-vertex-ai"],
 *         "maxSizeBytes": 20971520,
 *         "timeoutMs": 30000,
 *         "failOnError": false
 *       }
 *     }]
 *   }]
 * }
 */
export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: InlineImageUrlsParameters,
  eventType: HookEventType,
  options: PluginHandlerOptions
) => {
  let error = null;
  let verdict = true;
  let data: any = null;
  const transformedData: Record<string, any> = {
    request: { json: null },
    response: { json: null },
  };
  let transformed = false;

  // Ensure parameters is always an object
  const params = parameters || {};

  try {
    // Only process beforeRequestHook for chat completions and messages
    if (
      eventType !== 'beforeRequestHook' ||
      !['chatComplete', 'messages'].includes(context.requestType || '')
    ) {
      return {
        error: null,
        verdict: true,
        data: { skipped: true, reason: 'Not applicable for this request type' },
        transformedData,
        transformed: false,
      };
    }

    // Check if provider filter is specified
    const targetProviders = params.providers;
    if (targetProviders && targetProviders.length > 0 && context.provider) {
      if (!targetProviders.includes(context.provider)) {
        return {
          error: null,
          verdict: true,
          data: {
            skipped: true,
            reason: `Provider '${context.provider}' not in target providers list`,
          },
          transformedData,
          transformed: false,
        };
      }
    }

    const json = context.request?.json;
    const messages = json?.messages;

    if (!messages || !Array.isArray(messages)) {
      return {
        error: null,
        verdict: true,
        data: { skipped: true, reason: 'No messages found in request' },
        transformedData,
        transformed: false,
      };
    }

    const maxSizeBytes = params.maxSizeBytes || DEFAULT_MAX_SIZE_BYTES;
    const timeoutMs = params.timeoutMs || DEFAULT_TIMEOUT_MS;
    const failOnError = params.failOnError || false;

    const result = await processMessages(
      messages,
      options,
      maxSizeBytes,
      timeoutMs,
      failOnError
    );

    if (result.totalConverted > 0) {
      transformedData.request.json = {
        ...json,
        messages: result.messages,
      };
      transformed = true;
    }

    data = {
      imagesConverted: result.totalConverted,
      errors: result.errors,
      provider: context.provider,
    };
  } catch (e: any) {
    error = {
      name: e.name || 'InlineImageUrlsError',
      message: e.message || 'An error occurred while processing image URLs',
    };
    verdict = false;
    data = {
      explanation: `Error converting image URLs: ${e.message}`,
    };
  }

  return { error, verdict, data, transformedData, transformed };
};
