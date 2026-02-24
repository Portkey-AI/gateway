import * as crypto from 'crypto';

import { logger } from '../../../apm';
import { AnalyticsLogObjectV2 } from '../../../middlewares/portkey/types';
import { externalServiceFetch } from '../../../utils/fetch';
import { Environment } from '../../../utils/env';
import Long from 'long';

type AttributeValue =
  | { stringValue: string }
  | { boolValue: boolean }
  | { intValue: string }
  | { doubleValue: number }
  | { arrayValue: { values: AttributeValue[] } };

type SpanAttribute = {
  key: string;
  value: AttributeValue;
};

const OTEL_EXPORTER_OTLP_ENDPOINT = Environment({}).OTEL_ENDPOINT;
const OTEL_EXPORTER_OTLP_HEADERS =
  Environment({})
    .OTEL_EXPORTER_OTLP_HEADERS?.split(',')
    ?.reduce((acc: Record<string, string>, header: string) => {
      const parts = header.split('=');
      const key = parts[0].trim();
      const value = parts.slice(1).join('=').trim();
      acc[key] = value;
      return acc;
    }, {}) ?? {};
const OTEL_EXPORTER_OTLP_PROTOCOL = Environment({}).OTEL_EXPORTER_OTLP_PROTOCOL;

const EXPERIMENTAL_OTEL_EXPORTER_OTLP_ENDPOINT = Environment(
  {}
).EXPERIMENTAL_GEN_AI_OTEL_EXPORTER_OTLP_ENDPOINT;
const EXPERIMENTAL_OTEL_EXPORTER_OTLP_HEADERS =
  Environment({})
    .EXPERIMENTAL_GEN_AI_OTEL_EXPORTER_OTLP_HEADERS?.split(',')
    ?.reduce((acc: Record<string, string>, header: string) => {
      const parts = header.split('=');
      const key = parts[0].trim();
      const value = parts.slice(1).join('=').trim();
      acc[key] = value;
      return acc;
    }, {}) ?? {};

const TRACE_ID_REGEX = /^[0-9a-f]{32}$/;
const SPAN_ID_REGEX = /^[0-9a-f]{16}$/;

let otelResourceAttributes: SpanAttribute[] = [];

if (Environment({}).OTEL_PUSH_ENABLED === 'true') {
  try {
    const resourceAttributes = Environment({}).OTEL_RESOURCE_ATTRIBUTES;
    const otelServiceName = Environment({}).OTEL_SERVICE_NAME;

    if (otelServiceName) {
      otelResourceAttributes.push({
        key: 'service.name',
        value: { stringValue: otelServiceName },
      });
    }

    if (resourceAttributes) {
      // Parse comma-separated key-value pairs
      const attributes = resourceAttributes
        .split(',')
        .reduce((acc: SpanAttribute[], pair: string) => {
          const [key, value] = pair.split('=');
          if (key && value) {
            acc.push({
              key: key.trim(),
              value: { stringValue: value.trim() },
            });
          }
          return acc;
        }, [] as SpanAttribute[]);

      otelResourceAttributes = [...otelResourceAttributes, ...attributes];
    }
  } catch (error) {
    logger.warn({
      message: 'unable to parse configuration for pushing analytics to OTel',
      error,
    });
  }
}

export function toOtelTimestamp(ts: string): string {
  const date = new Date(ts.replace(' ', 'T') + 'Z'); // convert to ISO format

  const iso = date.toISOString(); // "2025-04-11T11:33:28.000Z"
  const [datePart, timePart] = iso.split('T');

  const [time, msZ] = timePart.split('.');
  const ms = (msZ || '000Z').replace('Z', '');
  const paddedMs = ms.padEnd(9, '0'); // pad to nanoseconds

  return `${datePart}T${time}.${paddedMs}Z`;
}

export function toSpanAttributes(input: Record<string, any>): SpanAttribute[] {
  const attributes: SpanAttribute[] = [];

  for (const [key, value] of Object.entries(input)) {
    let attr: SpanAttribute | null = null;

    if (typeof value === 'string') {
      attr = { key, value: { stringValue: value } };
    } else if (typeof value === 'boolean') {
      attr = { key, value: { boolValue: value } };
    } else if (typeof value === 'number') {
      // Distinguish integers from floats
      if (Number.isInteger(value)) {
        attr = { key, value: { intValue: value.toString() } };
      } else {
        attr = { key, value: { doubleValue: value } };
      }
    } else if (Array.isArray(value)) {
      const isArrayOfPrimitives = value.every((v) =>
        ['string', 'number', 'boolean'].includes(typeof v)
      );

      if (isArrayOfPrimitives) {
        const values: AttributeValue[] = value.map((v) => {
          if (typeof v === 'string') return { stringValue: v };
          if (typeof v === 'boolean') return { boolValue: v };
          if (typeof v === 'number') {
            return Number.isInteger(v)
              ? { intValue: v.toString() }
              : { doubleValue: v };
          }
          return { stringValue: JSON.stringify(v) }; // fallback
        });
        attr = { key, value: { arrayValue: { values } } };
      } else {
        // Nested arrays or objects in array → serialize as string
        attr = { key, value: { stringValue: JSON.stringify(value) } };
      }
    } else if (value === null || value === undefined) {
      continue; // skip nulls
    } else {
      // For objects, serialize to string
      attr = { key, value: { stringValue: JSON.stringify(value) } };
    }

    if (attr) {
      attributes.push(attr);
    }
  }

  return attributes;
}

const toValidHexId = (id: string, fallbackId: string, length: number) => {
  id = id?.replace(/-/g, '').slice(0, length);
  if (!id || !id.length) return fallbackId.replace(/-/g, '').slice(0, length);
  if (length === 32 && TRACE_ID_REGEX.test(id)) {
    return id;
  }
  if (length === 16 && SPAN_ID_REGEX.test(id)) {
    return id;
  }
  return crypto.createHash('sha256').update(id).digest('hex').slice(0, length);
};

const toValidOtelParentSpanId = (parentSpanId: string) => {
  if (!parentSpanId) {
    return null;
  }
  return toValidHexId(parentSpanId, crypto.randomUUID(), 16);
};

const getOtelStatusCodeFromHTTPStatusCode = (statusCode: number) => {
  if (!statusCode) {
    return 0;
  }
  if (statusCode > 200 || statusCode < 300) {
    return 1;
  }
  return 2;
};

const getHTTPStatusCodeFromOtelStatusCode = (statusCode: number) => {
  if (!statusCode) {
    return 200;
  }
  if (statusCode === 1) {
    return 200;
  }
  return 500;
};

// OpenTelemetry Span Kind values
// https://opentelemetry.io/docs/specs/otel/trace/api/#spankind
const SPAN_KIND = {
  UNSPECIFIED: 0,
  INTERNAL: 1,
  SERVER: 2,
  CLIENT: 3,
  PRODUCER: 4,
  CONSUMER: 5,
} as const;

/**
 * Flattens metadata from parallel arrays into individual key-value attributes.
 * Converts:
 *   { 'metadata.key': ['env', 'user'], 'metadata.value': ['prod', 'john'] }
 * To:
 *   { 'metadata.env': 'prod', 'metadata.user': 'john' }
 */
const flattenMetadataArrays = (
  metadataKeys: Array<string | null> | undefined,
  metadataValues: Array<string | null> | undefined
): Record<string, string> => {
  const flattened: Record<string, string> = {};

  if (!metadataKeys || !metadataValues) {
    return flattened;
  }

  const limit = Math.min(metadataKeys.length, metadataValues.length);
  for (let i = 0; i < limit; i++) {
    const key = metadataKeys[i];
    const value = metadataValues[i];

    if (
      key !== null &&
      key !== undefined &&
      value !== null &&
      value !== undefined
    ) {
      flattened[`metadata.${key}`] = value;
    }
  }

  return flattened;
};

const transformAnalyticsObjectsToOTelFormat = (
  analyticsObjects: AnalyticsLogObjectV2[]
) => {
  return analyticsObjects.map((obj) => {
    const startTime = new Date(obj.created_at).getTime() * 1e6; // Convert to nanoseconds
    const endTime = startTime + (obj.response_time || 0) * 1e6;
    const statusCode = getOtelStatusCodeFromHTTPStatusCode(
      obj.response_status_code
    );

    const traceId = toValidHexId(obj.trace_id, obj.id, 32);
    const spanId = toValidHexId(obj.span_id, crypto.randomUUID(), 16);
    const parentSpanId = toValidOtelParentSpanId(obj.parent_span_id);

    // Flatten metadata arrays into individual attributes for better queryability
    const flattenedMetadata = flattenMetadataArrays(
      obj['metadata.key'],
      obj['metadata.value']
    );

    // Create object for span attributes, replacing array metadata with flattened version
    const {
      'metadata.key': _metaKeys,
      'metadata.value': _metaValues,
      ...objWithoutMetadataArrays
    } = obj;
    const objWithFlattenedMetadata = {
      ...objWithoutMetadataArrays,
      ...flattenedMetadata,
    };

    return {
      traceId,
      spanId,
      ...(parentSpanId && { parentSpanId }),
      name: obj.span_name,
      kind: SPAN_KIND.SERVER, // Gateway receives and processes incoming requests
      attributes: toSpanAttributes(objWithFlattenedMetadata),
      startTimeUnixNano: startTime,
      endTimeUnixNano: endTime,
      status: {
        code: statusCode,
        message: String(obj.response_status_code),
      },
    };
  });
};

const getOtelPayloadApplicationJson = (
  analyticsObjects: AnalyticsLogObjectV2[]
) => {
  const otelSpans = transformAnalyticsObjectsToOTelFormat(analyticsObjects);
  const payload = {
    resourceSpans: [
      {
        resource: {
          attributes: otelResourceAttributes,
        },
        scopeSpans: [
          {
            scope: {
              name: Environment({}).OTEL_SERVICE_NAME || 'portkey',
            },
            spans: otelSpans,
          },
        ],
      },
    ],
  };
  return payload;
};

const getOtelPayloadProtobuf = (analyticsObjects: AnalyticsLogObjectV2[]) => {
  const otelSpans = transformAnalyticsObjectsToOTelFormat(analyticsObjects);
  const payload = {
    resourceSpans: [
      {
        resource: {
          attributes: otelResourceAttributes,
        },
        scopeSpans: [
          {
            scope: {
              name: Environment({}).OTEL_SERVICE_NAME || 'portkey',
            },
            spans: otelSpans.map((span) => ({
              ...span,
              ...(span.traceId && {
                traceId: Buffer.from(span.traceId, 'hex'),
              }),
              ...(span.spanId && { spanId: Buffer.from(span.spanId, 'hex') }),
              ...(span.parentSpanId && {
                parentSpanId: Buffer.from(span.parentSpanId, 'hex'),
              }),
              startTimeUnixNano: Long.fromValue(span.startTimeUnixNano),
              endTimeUnixNano: Long.fromValue(span.endTimeUnixNano),
            })),
          },
        ],
      },
    ],
  };
  return ExportTraceServiceRequest.encode(payload).finish();
};

export const pushAnalyticsObjectsToOTel = async (
  env: Record<string, any>,
  analyticsObjects: AnalyticsLogObjectV2[]
) => {
  let response;
  if (OTEL_EXPORTER_OTLP_PROTOCOL === 'http/protobuf') {
    response = await externalServiceFetch(
      `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
      {
        method: 'POST',
        body: getOtelPayloadProtobuf(analyticsObjects),
        headers: {
          ...OTEL_EXPORTER_OTLP_HEADERS,
          'Content-Type': 'application/x-protobuf',
        },
      }
    );
  } else {
    response = await externalServiceFetch(
      `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
      {
        method: 'POST',
        body: JSON.stringify(getOtelPayloadApplicationJson(analyticsObjects)),
        headers: {
          ...OTEL_EXPORTER_OTLP_HEADERS,
          'Content-Type': 'application/json',
        },
      }
    );
  }

  if (response && !response.ok) {
    const error = await response.json();
    logger.error({
      message: `Failed to push analytics objects to OTel: ${response.statusText}`,
      error,
    });
  }
};

// @ts-expect-error - This is a generated file
import opentelemetryTracesProto from '../utils/opentelemetryTracesProto.js';

export const ExportTraceServiceRequest =
  opentelemetryTracesProto.opentelemetry.proto.collector.trace.v1
    .ExportTraceServiceRequest;

const flattenSpanAttributes = (span: Record<string, any>) => {
  const flattenedAttributes: Record<string, any> = {};
  for (const attribute of span.attributes) {
    const key = attribute.key;
    let value =
      attribute.value?.stringValue ||
      attribute.value?.intValue ||
      attribute.value?.boolValue ||
      attribute.value?.doubleValue;
    if (Long.isLong(value)) {
      value = value.toNumber();
    }
    flattenedAttributes[`${key}`] = value;
  }
  return flattenedAttributes;
};

const replaceVariablePathsInString = (
  str: string,
  replacements: Record<string, any>
): string => {
  // Regex to match patterns like {gen_ai.request.model!r}
  const regex = /\{([^!{}]+)!r\}/g;

  return str.replace(regex, (match, variablePath) => {
    return replacements[variablePath] !== undefined
      ? String(replacements[variablePath])
      : match;
  });
};

const transformOtelSpanToAnalyticsObjects = (
  span: Record<string, any>,
  url: URL
) => {
  if (span.traceId instanceof Uint8Array) {
    span.traceId = Array.from(span.traceId)
      .map((byte: number) => byte.toString(16).padStart(2, '0'))
      .join('');
  }
  if (span.spanId instanceof Uint8Array) {
    span.spanId = Array.from(span.spanId)
      .map((byte: number) => byte.toString(16).padStart(2, '0'))
      .join('');
  }
  if (span.parentSpanId instanceof Uint8Array) {
    span.parentSpanId = Array.from(span.parentSpanId)
      .map((byte: number) => byte.toString(16).padStart(2, '0'))
      .join('');
  }
  const flattenedAttributes = flattenSpanAttributes(span);
  let name = span.name.replace('{name}', flattenedAttributes.name);
  name = replaceVariablePathsInString(name, flattenedAttributes);
  const model =
    flattenedAttributes['gen_ai.request.model'] ||
    flattenedAttributes['gen_ai.response.model'];
  span = { ...span, attributes: flattenedAttributes, name, model };
  return {
    metadata: {
      traceId: span.traceId,
      spanId: span.spanId,
      spanName: span.name,
      parentSpanId: span.parentSpanId,
      startTime: span.startTimeUnixNano,
      endTime: span.endTimeUnixNano,
      _logType: 'opentelemetry',
      ['gen_ai.operation.name']: flattenedAttributes['gen_ai.operation.name'],
    },
    request: {
      method: 'POST',
      url: url.toString(),
      headers: {
        'Content-Type': 'application/json',
      },
      body: span,
      provider: flattenedAttributes['gen_ai.system'],
    },
    response: {
      status: getHTTPStatusCodeFromOtelStatusCode(span.status.code),
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        model,
      },
      response_time: (span.endTimeUnixNano - span.startTimeUnixNano) * 10 ** -6,
    },
    output: {
      tokens: {
        requestUnits: flattenedAttributes['gen_ai.usage.input_tokens'] || 0,
        responseUnits: flattenedAttributes['gen_ai.usage.output_tokens'] || 0,
      },
    },
  };
};

export const transformOtelPayloadToAnalyticsObjects = (
  payload: Record<string, any>,
  url: URL
) => {
  const logObjects: Record<string, any>[] = [];
  const resourceSpans = payload.resourceSpans;
  for (const resourceSpan of resourceSpans) {
    const scopeSpans = resourceSpan.scopeSpans;
    for (const scopeSpan of scopeSpans) {
      const spans = scopeSpan.spans;
      for (const span of spans) {
        logObjects.push(transformOtelSpanToAnalyticsObjects(span, url));
      }
    }
  }
  return logObjects;
};

export const pushWinkyLogToOtelCollector = async (
  env: Record<string, any>,
  log: Record<string, any>
) => {
  try {
    const startTime = new Date(log.metrics.created_at).getTime() * 1e6;
    const endTime = startTime + (log.metrics.response_time || 0) * 1e6;

    const traceId = toValidHexId(log.metrics.trace_id, crypto.randomUUID(), 32);
    const spanId = toValidHexId(log.metrics.span_id, crypto.randomUUID(), 16);
    const parentSpanId = toValidOtelParentSpanId(log.metrics.parent_span_id);
    const statusCode = getOtelStatusCodeFromHTTPStatusCode(
      log.metrics.response_status_code
    );

    const span = {
      traceId,
      spanId,
      ...(parentSpanId && { parentSpanId }),
      name: log.metrics.span_name,
      kind: SPAN_KIND.SERVER, // Gateway receives and processes incoming requests
      startTimeUnixNano: startTime,
      endTimeUnixNano: endTime,
      status: {
        code: statusCode,
        message: String(log.metrics.response_status_code),
      },
      attributes: toSpanAttributes({
        // attributes.gen_ai.common.client
        'gen_ai.request.model': log.metrics.ai_model,
        // 'gen_ai.operation.name':
        'server.address': log.metrics.request_url,
        'server.port': 443, // handle this for websocket requests
        ...(log.metrics.response_status_code >= 300 && {
          'error.type': log.metrics.response_status_code,
        }),
        // attributes.gen_ai.inference.client
        ...(log.request.body?.max_tokens && {
          'gen_ai.request.max_tokens': log.request.body.max_tokens,
        }),
        // gen_ai.request.choice.count // check again
        ...(log.request.body?.temperature && {
          'gen_ai.request.temperature': log.request.body.temperature,
        }),
        ...(log.request.body?.top_p && {
          'gen_ai.request.top_p': log.request.body.top_p,
        }),
        ...(log.request.body?.stop && {
          'gen_ai.request.stop_sequences': log.request.body.stop,
        }),
        ...(log.request.body?.frequency_penalty && {
          'gen_ai.request.frequency_penalty':
            log.request.body.frequency_penalty,
        }),
        ...(log.request.body?.presence_penalty && {
          'gen_ai.request.presence_penalty': log.request.body.presence_penalty,
        }),
        ...(log.request.body?.seed && {
          'gen_ai.request.seed': log.request.body.seed,
        }),
        // gen_ai.output.type  // need to map to response_format
        ...(log.response.body?.id && {
          'gen_ai.response.id': log.response.body.id,
        }),
        'gen_ai.response.model': log.metrics.ai_model,
        ...(log.response.body?.choices && {
          'gen_ai.response.finish_reasons': log.response.body.choices.map(
            (choice: Record<string, any>) => choice.finish_reason
          ),
        }),
        'gen_ai.response.input_tokens': log.metrics.req_units,
        'gen_ai.response.output_tokens': log.metrics.res_units,
        // gen_ai.conversation.id
        // ...(log.request.body?.messages && {
        //   // this is the strucutre specified in the convention but langsmith does not support it properly yet
        //   'gen_ai.input.messages': log.request.body.messages.filter(
        //     (message: Record<string, any>) => message.role !== 'system'
        //   ),
        //   'gen_ai.system_instructions': log.request.body.messages.filter(
        //     (message: Record<string, any>) => message.role === 'system'
        //   ),
        // }),
        ...(log.request.body?.messages &&
          log.request.body.messages.reduce(
            (acc: Record<string, any>, message: any, index: any) => ({
              ...acc,
              [`gen_ai.prompt.${index}.role`]: message.role,
              [`gen_ai.prompt.${index}.content`]: message.content,
            }),
            {}
          )),
        ...(log.request.body?.input && {
          'gen_ai.input.messages': log.request.body.input,
        }),
        ...(log.response.body?.choices && {
          'gen_ai.output.messages': log.response.body.choices.map(
            (choice: Record<string, any>) => choice.message
          ),
        }),
        ...(log.response.body?.data && {
          'gen_ai.output.messages': log.response.body.data,
        }),
        ...(log.request.body?.tools && {
          'gen_ai.tool.definitions': log.request.body.tools,
        }),
        // span.gen_ai.inference.client
        'gen_ai.provider.name': log.metrics.ai_provider,
        // langsmith specific attributes
        ...(log.request.body?.tools && {
          tools: log.request.body.tools,
        }),
      }),
    };

    const otelPayload = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'portkey' } },
              { key: 'otel.semconv.version', value: { stringValue: '1.37.0' } },
            ],
          },
          scopeSpans: [
            {
              scope: {
                name: 'custom.genai.instrumentation',
              },
              spans: [span],
            },
          ],
        },
      ],
    };

    const response = await externalServiceFetch(
      `${EXPERIMENTAL_OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
      {
        method: 'POST',
        body: JSON.stringify(otelPayload),
        headers: {
          ...EXPERIMENTAL_OTEL_EXPORTER_OTLP_HEADERS,
          'Content-Type': 'application/json',
        },
      }
    );
    if (response && !response.ok) {
      const error = await response.json();
      throw new Error(
        `Fetch failed when pushing log object to OTel: ${response.statusText}, ${error}`
      );
    }
  } catch (error: any) {
    logger.error({
      message: `Failed to push log object to OTel: ${error}, ${error.stack}`,
    });
  }
};
