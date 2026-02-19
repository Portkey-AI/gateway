import { Context } from 'hono';
import { uploadToLogStore } from '../services/winky';
import { env } from 'hono/adapter';
import { logger } from '../apm';
import { PORTKEY_HEADER_KEYS } from '../middlewares/portkey/globals';
import { transformOtelPayloadToAnalyticsObjects } from '../services/winky/libs/openTelemetry';
// @ts-expect-error - opentelemetryTracesProto is a generated protobuf file
import opentelemetryTracesProto from '../services/winky/utils/opentelemetryTracesProto.js';

const ExportTraceServiceRequest =
  opentelemetryTracesProto.opentelemetry.proto.collector.trace.v1
    .ExportTraceServiceRequest;

export async function otelTracesHandler(c: Context): Promise<Response> {
  try {
    const requestHeaders = c.get('mappedHeaders');
    const contentType = requestHeaders['content-type'];
    let requestBody;
    if (contentType === 'application/x-protobuf') {
      const buffer = c.get('requestBodyData').requestBinary;
      requestBody = ExportTraceServiceRequest.decode(new Uint8Array(buffer));
    } else {
      requestBody = c.get('requestBodyData').bodyJSON;
    }
    const overrideLogUsage =
      requestHeaders[PORTKEY_HEADER_KEYS.OVERRIDE_SERVICE_LOG_USAGE] === 'true';
    const logObjects = transformOtelPayloadToAnalyticsObjects(
      requestBody,
      new URL(c.req.url)
    );
    return uploadToLogStore(
      logObjects,
      'generations',
      false,
      env(c),
      {
        headers: new Headers(requestHeaders),
        method: c.req.method,
        url: c.req.url,
      },
      overrideLogUsage
    );
  } catch (err: any) {
    logger.error(`otelLogHandler error:`, err);
    return new Response(
      JSON.stringify({
        status: 'failure',
        message: 'Something went wrong',
      }),
      {
        status: 500,
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  }
}
