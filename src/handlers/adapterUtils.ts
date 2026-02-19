/**
 * Adapter utilities for Messages and Responses API.
 *
 * When a provider doesn't natively support the requested API (Messages or Responses),
 * these functions handle the request/response transformation via ChatCompletions
 * as an intermediate format. The decision is made per-provider inside tryPost,
 * so mixed configs (e.g., Anthropic + OpenAI in a loadbalancer) correctly use
 * native passthrough for native providers and the adapter for non-native ones.
 */

import { Context } from 'hono';
import { endpointStrings } from '../providers/types';
import { Params } from '../types/requestBody';
import { logger } from '../apm';
import {
  transformMessagesToChatCompletions,
  transformChatCompletionsToMessages,
  transformStreamChunk as messagesTransformStreamChunk,
  createStreamState as messagesCreateStreamState,
  supportsMessagesApiNatively,
} from '../adapters/messages';
import {
  transformResponsesToChatCompletions,
  transformChatCompletionsToResponses,
  transformStreamChunk as responsesTransformStreamChunk,
  createStreamState as responsesCreateStreamState,
  supportsResponsesApiNatively,
} from '../adapters/responses';

// ── Types ───────────────────────────────────────────────────────────────────

export interface AdapterContext {
  /** Whether the adapter is active for this request */
  isActive: boolean;
  /** The original endpoint before switching to chatComplete */
  originalFn: endpointStrings;
  /** Raw request body (without overrides) for Responses API response echoing */
  originalRequest: any;
  /** The resolved provider name */
  provider: string;
}

export interface AdapterRequestResult {
  adapterCtx: AdapterContext;
  params: Params;
  requestBody: Params | FormData | ArrayBuffer | ReadableStream;
  fn: endpointStrings;
}

// ── Request Transform ───────────────────────────────────────────────────────

/**
 * Detect if an adapter is needed and transform the request accordingly.
 *
 * @returns `null` if no adapter is needed (native provider or non-adapter endpoint).
 * @returns A `Response` if the request should be rejected (e.g., GET/DELETE on non-native).
 * @returns An `AdapterRequestResult` with the transformed params, fn, and adapter context.
 */
export function applyAdapterRequestTransform(
  fn: endpointStrings,
  provider: string,
  params: Params,
  requestBody: Params | FormData | ArrayBuffer | ReadableStream,
  isStreamingMode: boolean,
  method: string
): AdapterRequestResult | Response | null {
  if (
    fn === 'messages' &&
    provider &&
    !supportsMessagesApiNatively(provider, params.model || '')
  ) {
    const originalRequest =
      requestBody instanceof ReadableStream || requestBody instanceof FormData
        ? {}
        : { ...(requestBody as Params) };
    const transformedParams = transformMessagesToChatCompletions(params);

    return {
      adapterCtx: {
        isActive: true,
        originalFn: fn,
        originalRequest,
        provider,
      },
      params: transformedParams,
      requestBody: transformedParams as any,
      fn: 'chatComplete',
    };
  }

  if (
    fn === 'createModelResponse' &&
    provider &&
    !supportsResponsesApiNatively(provider)
  ) {
    const originalRequest =
      requestBody instanceof ReadableStream || requestBody instanceof FormData
        ? {}
        : { ...(requestBody as Params) };
    const transformedParams = transformResponsesToChatCompletions(params);

    return {
      adapterCtx: {
        isActive: true,
        originalFn: fn,
        originalRequest,
        provider,
      },
      params: transformedParams,
      requestBody: transformedParams as any,
      fn: 'chatComplete',
    };
  }

  if (
    [
      'getModelResponse',
      'deleteModelResponse',
      'listResponseInputItems',
    ].includes(fn) &&
    provider &&
    !supportsResponsesApiNatively(provider)
  ) {
    return new Response(
      JSON.stringify({
        error: {
          message: `${method} /v1/responses is only supported for native Responses API providers`,
          type: 'invalid_request_error',
        },
      }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );
  }

  return null;
}

// ── Response Transform ──────────────────────────────────────────────────────

/**
 * If the adapter is active, transform the chatComplete-format response
 * back to the original API format (Messages or Responses).
 * For non-adapter requests this is a no-op passthrough.
 */
export async function adaptResponse(
  response: Response,
  adapterCtx: AdapterContext,
  c: Context
): Promise<Response> {
  if (!adapterCtx.isActive) return response;

  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('text/event-stream')) {
    return adaptStreamingResponse(response, adapterCtx.originalFn, c);
  }

  return adaptNonStreamingResponse(response, adapterCtx, c);
}

/**
 * Transform a non-streaming chatComplete JSON response to
 * Messages or Responses API format.
 */
async function adaptNonStreamingResponse(
  response: Response,
  adapterCtx: AdapterContext,
  c: Context
): Promise<Response> {
  let json: any;
  try {
    json = await response.json();
  } catch (err) {
    logger.error({
      message:
        'Adapter response JSON parse failed, returning original response',
      originalFn: adapterCtx.originalFn,
      provider: adapterCtx.provider,
      status: response.status,
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response(
      JSON.stringify({
        error: { message: 'Internal error', type: 'server_error' },
      }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }

  let transformedJson: any;
  if (adapterCtx.originalFn === 'messages') {
    transformedJson = transformChatCompletionsToMessages(
      json,
      response.status,
      adapterCtx.provider
    );
  } else {
    transformedJson = transformChatCompletionsToResponses(
      json,
      response.status,
      adapterCtx.provider,
      adapterCtx.originalRequest
    );
  }

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');

  const newResponse = new Response(JSON.stringify(transformedJson), {
    status: response.status,
    headers,
  });

  // Update requestOptions so logging captures the adapted format
  const reqOptions = c.get('requestOptions');
  if (reqOptions?.length) {
    const lastOption = reqOptions[reqOptions.length - 1];
    lastOption.response = newResponse;
    lastOption.providerOptions.rubeusURL = adapterCtx.originalFn;
  }

  return newResponse;
}

// ── Streaming Transform ─────────────────────────────────────────────────────

/**
 * Transform a streaming chatComplete response to Messages or Responses API SSE format.
 * Reads from a clone of the response so the original body (stored in requestOptions)
 * remains readable for middleware/logging until the async overwrite completes.
 */
function adaptStreamingResponse(
  response: Response,
  originalFn: endpointStrings,
  c: Context
): Response {
  if (!response.body) return response;

  const responseToProcess = response.clone();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const reader = responseToProcess.body!.getReader();
  const encoder = new TextEncoder();

  if (originalFn === 'messages') {
    const state = messagesCreateStreamState();

    (async () => {
      try {
        for await (const chunk of readSSEStream(reader)) {
          const transformed = messagesTransformStreamChunk(chunk, state);
          if (transformed) {
            await writer.write(encoder.encode(transformed));
          }
        }
        // Flush completion events for providers whose streams end without
        // a `data: [DONE]` message (e.g. Google/Gemini).
        const finalEvents = messagesTransformStreamChunk('data: [DONE]', state);
        if (finalEvents) {
          await writer.write(encoder.encode(finalEvents));
        }
      } catch (err) {
        logger.error('Adapter stream transform error:', err);
      } finally {
        writer.close();
      }
    })();
  } else {
    // Responses API adapter
    const state = responsesCreateStreamState();

    (async () => {
      try {
        for await (const chunk of readSSEStream(reader)) {
          const transformed = responsesTransformStreamChunk(chunk, state);
          if (transformed) {
            await writer.write(encoder.encode(transformed));
          }
        }
        // Flush completion events for providers whose streams end without
        // a `data: [DONE]` message (e.g. Google/Gemini). The idempotency
        // guard in transformStreamChunk ensures this is a no-op when
        // [DONE] was already processed.
        const finalEvents = responsesTransformStreamChunk(
          'data: [DONE]',
          state
        );
        if (finalEvents) {
          await writer.write(encoder.encode(finalEvents));
        }
      } catch (err) {
        logger.error('Adapter stream transform error:', err);
      } finally {
        writer.close();
      }
    })();
  }

  // Carry forward upstream headers (trace-id, cache-status, provider, etc.)
  // but override entity/transport headers for the new SSE body.
  const headers = new Headers(response.headers);
  headers.set('content-type', 'text/event-stream');
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('transfer-encoding');

  const adaptedResponse = new Response(readable, {
    status: 200,
    headers,
  });

  // Synchronously update requestOptions so the logging middleware
  // reads the adapted stream (not the pre-adapter Chat Completions stream).
  // Clone ensures both the client and the middleware can read independently.
  const requestOptions = c.get('requestOptions');
  if (requestOptions?.length) {
    const lastOption = requestOptions[requestOptions.length - 1];
    lastOption.response = adaptedResponse.clone();
    lastOption.providerOptions.rubeusURL = originalFn;
  }

  return adaptedResponse;
}

// ── SSE Stream Reader ───────────────────────────────────────────────────────

/**
 * Async generator to read SSE chunks from a ReadableStream.
 * Yields complete SSE messages (delimited by double newlines).
 */
async function* readSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      if (buffer.trim()) yield buffer;
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    while (buffer.includes('\n\n')) {
      const idx = buffer.indexOf('\n\n');
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (chunk.trim()) yield chunk;
    }
  }
}
