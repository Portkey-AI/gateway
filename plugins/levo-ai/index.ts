import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { post } from '../utils';

// Declare crypto for TypeScript
declare const crypto: {
  getRandomValues: (array: Uint8Array) => Uint8Array;
  randomUUID?: () => string;
};

/**
 * Converts HookSpanContext to OTLP ResourceSpans format
 *
 * Collector exporter expects EXACTLY 2 spans per scope:
 * 1. REQUEST_ROOT span with levo.span.type = "REQUEST_ROOT"
 * 2. RESPONSE_ROOT span with levo.span.type = "RESPONSE_ROOT"
 *
 * See: collector-components/exporter/levosatexporter/levoai_satellite.go:279-316
 * See: collector-components/receiver/f5ltmlogsreceiver/encoder.go:60,92
 */
function convertToOTLP(context: PluginContext, hookSpanId: string): any {
  const now = Date.now();
  const nowNano = now * 1000000; // Convert to nanoseconds

  // Generate trace ID (same for both spans)
  const seed =
    hookSpanId ||
    crypto.randomUUID?.() ||
    `trace-${Date.now()}-${Math.random()}`;
  const traceId =
    context.metadata?.traceId ||
    context.metadata?.['x-portkey-trace-id'] ||
    context.request?.headers?.['x-portkey-trace-id'] ||
    generateTraceIdFromString(seed);

  // Generate span IDs
  const requestSpanId = generateSpanId();
  const responseSpanId = generateSpanId();

  const parentSpanId =
    context.metadata?.parentSpanId ||
    context.metadata?.['x-portkey-parent-span-id'] ||
    context.request?.headers?.['x-portkey-parent-span-id'];

  // Span kind: 3 = CLIENT (Portkey is a client to LLM providers)
  const spanKind = 3;

  // ============ REQUEST SPAN (REQUEST_ROOT) ============
  const requestAttributes: any[] = [
    {
      key: 'levo.span.type',
      value: { stringValue: 'REQUEST_ROOT' },
    },
    {
      key: 'http.method',
      value: { stringValue: 'POST' },
    },
    {
      key: 'http.target',
      value: {
        stringValue: `/v1/${context.requestType || 'chat/completions'}`,
      },
    },
    {
      key: 'http.scheme',
      value: { stringValue: 'https' },
    },
  ];

  // Request headers (as arrays like f5ltmlogsreceiver does)
  if (context.request?.headers) {
    const headerNames: any[] = [];
    const headerValues: any[] = [];
    Object.entries(context.request.headers).forEach(([name, value]) => {
      headerNames.push({ stringValue: name });
      headerValues.push({ stringValue: String(value) });
    });
    requestAttributes.push({
      key: 'levo.http.request.header.names',
      value: { arrayValue: { values: headerNames } },
    });
    requestAttributes.push({
      key: 'levo.http.request.header.values',
      value: { arrayValue: { values: headerValues } },
    });
  }

  // Request body (as array like f5ltmlogsreceiver does)
  const requestBodyBuffers: any[] = [];
  if (context.request?.json) {
    requestBodyBuffers.push({
      stringValue: JSON.stringify(context.request.json),
    });
  } else if (context.request?.text) {
    requestBodyBuffers.push({ stringValue: context.request.text });
  }
  if (requestBodyBuffers.length > 0) {
    requestAttributes.push({
      key: 'levo.http.request.body.buffers',
      value: { arrayValue: { values: requestBodyBuffers } },
    });
  }

  // Add provider and request type
  if (context.provider) {
    requestAttributes.push({
      key: 'levo.provider',
      value: { stringValue: context.provider },
    });
  }
  if (context.requestType) {
    requestAttributes.push({
      key: 'levo.request.type',
      value: { stringValue: context.requestType },
    });
  }

  // ============ RESPONSE SPAN (RESPONSE_ROOT) ============
  const responseAttributes: any[] = [
    {
      key: 'levo.span.type',
      value: { stringValue: 'RESPONSE_ROOT' },
    },
  ];

  // HTTP status code
  const statusCode = context.response?.statusCode || 200;
  responseAttributes.push({
    key: 'http.status_code',
    value: { intValue: statusCode.toString() },
  });

  // Response headers (as arrays)
  if (context.response?.headers) {
    const headerNames: any[] = [];
    const headerValues: any[] = [];
    Object.entries(context.response.headers).forEach(([name, value]) => {
      headerNames.push({ stringValue: name });
      headerValues.push({ stringValue: String(value) });
    });
    responseAttributes.push({
      key: 'levo.http.response.header.names',
      value: { arrayValue: { values: headerNames } },
    });
    responseAttributes.push({
      key: 'levo.http.response.header.values',
      value: { arrayValue: { values: headerValues } },
    });
  }

  // Response body (as array)
  const responseBodyBuffers: any[] = [];
  if (context.response?.json) {
    responseBodyBuffers.push({
      stringValue: JSON.stringify(context.response.json),
    });
  } else if (context.response?.text) {
    responseBodyBuffers.push({ stringValue: context.response.text });
  }
  if (responseBodyBuffers.length > 0) {
    responseAttributes.push({
      key: 'levo.http.response.body.buffers',
      value: { arrayValue: { values: responseBodyBuffers } },
    });
  }

  // Add model and usage info to response span
  if (context.response?.json?.model) {
    responseAttributes.push({
      key: 'gen_ai.response.model',
      value: { stringValue: context.response.json.model },
    });
  }
  if (context.response?.json?.usage) {
    const usage = context.response.json.usage;
    if (usage.prompt_tokens) {
      responseAttributes.push({
        key: 'gen_ai.usage.prompt_tokens',
        value: { intValue: usage.prompt_tokens.toString() },
      });
    }
    if (usage.completion_tokens) {
      responseAttributes.push({
        key: 'gen_ai.usage.completion_tokens',
        value: { intValue: usage.completion_tokens.toString() },
      });
    }
    if (usage.total_tokens) {
      responseAttributes.push({
        key: 'gen_ai.usage.total_tokens',
        value: { intValue: usage.total_tokens.toString() },
      });
    }
  }

  // Build REQUEST_ROOT span
  const requestSpan: any = {
    traceId: traceId,
    spanId: requestSpanId,
    name: `${context.provider}/${context.requestType}/request`,
    kind: spanKind,
    startTimeUnixNano: nowNano.toString(),
    endTimeUnixNano: nowNano.toString(),
    attributes: requestAttributes,
    status: { code: 'STATUS_CODE_OK' },
  };

  // Build RESPONSE_ROOT span
  const responseSpan: any = {
    traceId: traceId, // Same trace ID
    spanId: responseSpanId,
    name: `${context.provider}/${context.requestType}/response`,
    kind: spanKind,
    startTimeUnixNano: nowNano.toString(),
    endTimeUnixNano: nowNano.toString(),
    attributes: responseAttributes,
    status:
      statusCode === 200
        ? { code: 'STATUS_CODE_OK' }
        : { code: 'STATUS_CODE_ERROR', message: `HTTP ${statusCode}` },
  };

  if (parentSpanId) {
    requestSpan.parentSpanId = parentSpanId;
    responseSpan.parentSpanId = parentSpanId;
  }

  // Build OTLP trace structure with 2 spans in same scope
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            {
              key: 'service.name',
              value: { stringValue: 'portkey-gateway' },
            },
            {
              key: 'service.version',
              value: { stringValue: '1.0.0' },
            },
          ],
        },
        scopeSpans: [
          {
            scope: {
              name: 'levo-portkey-observability',
              version: '1.0.0',
            },
            spans: [requestSpan, responseSpan], // EXACTLY 2 spans as exporter expects
          },
        ],
      },
    ],
  };
}

/**
 * Generate a deterministic 32-character hex trace ID from a string seed
 * Ensures same trace ID is generated from same seed (e.g., hookSpanId)
 */
function generateTraceIdFromString(seed: string): string {
  if (!seed || typeof seed !== 'string') {
    seed = `trace-${Date.now()}-${Math.random()}`;
  }
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = (hash >> (i * 2)) & 0xff;
  }

  for (let i = 0; i < seed.length && i < 16; i++) {
    bytes[i] = (bytes[i] + seed.charCodeAt(i)) & 0xff;
  }

  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a random 32-character hex trace ID (OTLP format)
 */
function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Fallback for environments without crypto
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a 16-character hex span ID (OTLP format)
 */
function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Fallback for environments without crypto
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  let error = null;
  let verdict = true;
  let data = null;

  try {
    // CRITICAL: Only execute on afterRequestHook
    // This is when we have BOTH complete request AND response data
    if (eventType !== 'afterRequestHook') {
      return {
        error: null,
        verdict: true,
        data: { skipped: true, reason: 'Only runs on afterRequestHook' },
      };
    }

    // WARNING: In streaming mode, responseJSON is null
    // This plugin will skip streaming requests
    if (context.request?.isStreamingRequest && !context.response?.json) {
      return {
        error: null,
        verdict: true,
        data: {
          skipped: true,
          reason: 'Streaming response not fully buffered',
        },
      };
    }

    const endpoint = parameters.endpoint || 'http://localhost:4318/v1/traces';

    // Convert context to single complete OTLP span
    // hookSpanId might not be on context, use a fallback
    const hookSpanId =
      context.hookSpanId ||
      context.metadata?.hookSpanId ||
      `span-${Date.now()}`;
    const otlpTrace = convertToOTLP(context, hookSpanId);

    // Parse custom headers if provided
    const headers: Record<string, string> = parameters?.headers
      ? JSON.parse(parameters.headers)
      : {};

    // Set OTLP required headers
    headers['Content-Type'] = 'application/json';

    // Send organization ID exactly as sensors do
    // Sensors send: x-levo-organization-id header (see ebpf_sensor.cpp:392)
    if (!parameters?.organizationId) {
      throw new Error(
        'organizationId is required. Provide it in plugin parameters.'
      );
    }
    headers['x-levo-organization-id'] = String(parameters.organizationId);

    // Send workspace ID if provided (sensors also have workspace ID in config)
    if (parameters?.workspaceId) {
      headers['x-levo-workspace-id'] = String(parameters.workspaceId);
    }

    // Send to OTLP collector
    await post(endpoint, otlpTrace, { headers }, parameters.timeout || 5000);

    verdict = true;
    data = {
      message: `Sent OTLP trace to ${endpoint}`,
      traceId: otlpTrace.resourceSpans[0].scopeSpans[0].spans[0].traceId,
      requestSpanId: otlpTrace.resourceSpans[0].scopeSpans[0].spans[0].spanId,
      responseSpanId: otlpTrace.resourceSpans[0].scopeSpans[0].spans[1].spanId,
    };
  } catch (e: any) {
    delete e.stack;
    error = e;
    verdict = false;
  }

  return { error, verdict, data };
};
