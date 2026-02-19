import { Context } from 'hono';
import { addMiddlewareMetrics } from '../apm/prometheus/utils';
import {
  getCustomLabels,
  httpRequestDurationSeconds,
  llmLastByteDiffDurationMilliseconds,
  llmRequestDurationMilliseconds,
  portkeyProcessingTimeExcludingLastByteMs,
  portkeyRequestDurationMilliseconds,
  requestCounter,
} from '../apm/prometheus/prometheusClient';
import { HEADER_KEYS, METRICS_KEYS } from '../globals';
import { PORTKEY_HEADER_KEYS } from './portkey/globals';

const getPayloadSizeRange = (c: Context) => {
  const payloadSize = c.get(METRICS_KEYS.PAYLOAD_SIZE_IN_MB);
  if (!payloadSize) {
    return 'na';
  }
  if (payloadSize < 2) {
    return '0-2MB';
  } else if (payloadSize < 5) {
    return '2-5MB';
  } else if (payloadSize < 10) {
    return '5-10MB';
  } else if (payloadSize < 20) {
    return '10-20MB';
  }
  return '>20MB';
};

export const addMetricsMiddleware = () => {
  return async (c: Context, next: any) => {
    // ignore Dataservice requests
    const ignoreLog =
      c.req.raw.headers.get(PORTKEY_HEADER_KEYS.IGNORE_SERVICE_LOG) === 'true';
    if (c.req.path !== '/metrics' && !ignoreLog) {
      const method = c.req.method;

      // Start the timer before calling next()
      const end = httpRequestDurationSeconds.startTimer();
      c.set(METRICS_KEYS.LLM_LATENCY, 0);
      c.set(METRICS_KEYS.LLM_LAST_BYTE_DIFF_LATENCY, 0);
      try {
        await next();
      } finally {
        if (
          c.req.url.includes('/realtime') &&
          c.req.header('upgrade') === 'websocket' &&
          (c.res.status >= 400 || c.get('websocketError') === true)
        ) {
          const finalStatus =
            c.get('websocketError') === true ? 500 : c.res.status;
          const socket = c.env.incoming.socket;
          if (socket) {
            socket.write(`HTTP/1.1 ${finalStatus} ${c.res.statusText}\r\n\r\n`);
            socket.destroy();
          }
        }

        const code = c.res.status.toString();

        // Extract custom labels after all middleware has run
        const customLabels = getCustomLabels(
          c.get('mappedHeaders')?.[HEADER_KEYS.METADATA] ||
            c.req.header(HEADER_KEYS.METADATA) ||
            ''
        );

        // Get request details from request options
        let provider = 'N/A';
        let model = 'N/A';
        let stream = 0;
        let cacheStatus = 'N/A';

        const requestOptions = c.get('requestOptions');
        const source = requestOptions?.length ? 'provider' : 'portkey';
        if (requestOptions?.[0]) {
          provider = requestOptions[0].providerOptions?.provider || 'N/A';
          stream = c.res.headers
            .get('content-type')
            ?.includes('text/event-stream')
            ? 1
            : 0;
          cacheStatus = requestOptions[0].cacheStatus || 'N/A';

          // Get model from request params based on provider format
          const params = requestOptions[0].requestParams;
          if (params) {
            model =
              params.model || // OpenAI format
              params.messages?.[0]?.model || // Some chat formats
              params.request?.model || // Some provider formats
              requestOptions[0]?.finalUntransformedRequest?.body?.model || // For providers where model is removed from body during transformation
              'N/A';
          }
        }

        const endpoint =
          requestOptions?.[0]?.providerOptions?.rubeusURL ?? 'proxy';
        // Combine standard labels with JSON-encoded custom labels
        const labels = {
          method,
          endpoint,
          code,
          ...customLabels,
          provider,
          model,
          source,
          stream,
          cacheStatus,
          payloadSizeRange: getPayloadSizeRange(c),
        };
        // Increment the request counter with all labels
        requestCounter.inc(labels);

        // End the timer with all labels
        const totalHTTPLatency = end(labels);
        const actLLMLatency = c.get(METRICS_KEYS.LLM_LATENCY);
        if (typeof actLLMLatency === 'number') {
          llmRequestDurationMilliseconds.labels(labels).observe(actLLMLatency);
          const lastByteDiffLatency = c.get(
            METRICS_KEYS.LLM_LAST_BYTE_DIFF_LATENCY
          );
          if (typeof lastByteDiffLatency === 'number') {
            llmLastByteDiffDurationMilliseconds
              .labels(labels)
              .observe(lastByteDiffLatency);
          }
          const portkeyLatency = totalHTTPLatency * 1000 - actLLMLatency;
          const portkeyLatencyWithoutLastByteDiffLatency =
            portkeyLatency - (lastByteDiffLatency || 0);
          portkeyRequestDurationMilliseconds
            .labels(labels)
            .observe(portkeyLatency);

          portkeyProcessingTimeExcludingLastByteMs
            .labels(labels)
            .observe(portkeyLatencyWithoutLastByteDiffLatency);
          addMiddlewareMetrics(c, labels);
        }
      }
    } else {
      await next();
    }
  };
};
