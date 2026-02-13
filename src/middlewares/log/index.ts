import { Context } from 'hono';
import { getRuntimeKey } from 'hono/adapter';
import { emitSentryMetrics } from '../../services/sentryMetrics';

let logId = 0;
const MAX_RESPONSE_LENGTH = 100000;
const MAX_STDOUT_BODY_LENGTH = 10000;
const LOG_REQUEST_BODY = process.env.LOG_REQUEST_BODY === 'true';

// Map to store all connected log clients
const logClients: Map<string | number, any> = new Map();

const addLogClient = (clientId: any, client: any) => {
  logClients.set(clientId, client);
};

const removeLogClient = (clientId: any) => {
  logClients.delete(clientId);
};

const broadcastLog = async (log: any) => {
  const message = {
    data: log,
    event: 'log',
    id: String(logId++),
  };

  const deadClients: any = [];

  // Run all sends in parallel
  await Promise.all(
    Array.from(logClients.entries()).map(async ([id, client]) => {
      try {
        await Promise.race([
          client.sendLog(message),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Send timeout')), 1000)
          ),
        ]);
      } catch (error: any) {
        console.error(`Failed to send log to client ${id}:`, error.message);
        deadClients.push(id);
      }
    })
  );

  // Remove dead clients after iteration
  deadClients.forEach((id: any) => {
    removeLogClient(id);
  });
};

function logToStdout(c: Context, ms: number, requestOptionsArray: any[]) {
  try {
    const lastOption = requestOptionsArray[requestOptionsArray.length - 1];
    const firstOption = requestOptionsArray[0];
    const responseHeaders = lastOption?.response?.headers;

    // Token usage from the final response (originalResponse.body follows OpenAI format after transformation)
    const usage = lastOption?.originalResponse?.body?.usage;

    const logEntry: Record<string, any> = {
      timestamp: new Date().toISOString(),
      level: 'info',
      type: 'request_log',

      // Request info
      method: c.req.method,
      endpoint: new URL(c.req.url).pathname,
      status: c.res.status,
      stream: firstOption?.requestParams?.stream ?? false,

      // Provider info
      provider: lastOption?.providerOptions?.provider ?? null,
      model: lastOption?.requestParams?.model ?? null,

      // Timing
      duration_ms: ms,
      execution_time_ms: lastOption?.executionTime ?? null,

      // Token usage
      prompt_tokens: usage?.prompt_tokens ?? null,
      completion_tokens: usage?.completion_tokens ?? null,
      total_tokens: usage?.total_tokens ?? null,

      // Gateway metadata
      trace_id: responseHeaders?.get?.('x-portkey-trace-id') ?? null,
      retry_attempt_count: parseInt(
        responseHeaders?.get?.('x-portkey-retry-attempt-count') ?? '0',
        10
      ),
      retry_config: lastOption?.providerOptions?.retry
        ? {
            attempts: lastOption.providerOptions.retry.attempts,
            on_status_codes:
              lastOption.providerOptions.retry.onStatusCodes ?? [],
          }
        : null,
      last_used_option_index: lastOption?.lastUsedOptionIndex ?? null,
      total_attempts: requestOptionsArray.length,

      // Cache
      cache_status: lastOption?.cacheStatus ?? null,
      cache_mode: lastOption?.cacheMode ?? null,

      // Metadata (user-provided via x-portkey-metadata header)
      metadata: lastOption?.providerOptions?.metadata ?? null,

      // Weight (for load balancing)
      weight: lastOption?.providerOptions?.weight ?? null,
    };

    // Detailed token usage breakdown (if available)
    if (usage?.completion_tokens_details || usage?.prompt_tokens_details) {
      logEntry.token_details = {};
      if (usage.completion_tokens_details) {
        logEntry.token_details.completion = usage.completion_tokens_details;
      }
      if (usage.prompt_tokens_details) {
        logEntry.token_details.prompt = usage.prompt_tokens_details;
      }
      // Anthropic-style cache tokens
      if (usage.cache_read_input_tokens != null) {
        logEntry.token_details.cache_read_input_tokens =
          usage.cache_read_input_tokens;
      }
      if (usage.cache_creation_input_tokens != null) {
        logEntry.token_details.cache_creation_input_tokens =
          usage.cache_creation_input_tokens;
      }
    }

    if (LOG_REQUEST_BODY) {
      // Request body
      if (firstOption?.requestParams) {
        const reqBody = JSON.stringify(firstOption.requestParams);
        logEntry.request_body =
          reqBody.length > MAX_STDOUT_BODY_LENGTH
            ? reqBody.substring(0, MAX_STDOUT_BODY_LENGTH) + '...[truncated]'
            : firstOption.requestParams;
      }

      // Response body
      if (lastOption?.originalResponse?.body) {
        const resBody = JSON.stringify(lastOption.originalResponse.body);
        logEntry.response_body =
          resBody.length > MAX_STDOUT_BODY_LENGTH
            ? resBody.substring(0, MAX_STDOUT_BODY_LENGTH) + '...[truncated]'
            : lastOption.originalResponse.body;
      }
    }

    console.log(JSON.stringify(logEntry));

    // Emit Sentry metrics (fire-and-forget, errors are caught internally)
    emitSentryMetrics({
      provider: logEntry.provider,
      model: logEntry.model,
      endpoint: logEntry.endpoint,
      status: logEntry.status,
      stream: logEntry.stream,
      duration_ms: logEntry.duration_ms,
      prompt_tokens: logEntry.prompt_tokens,
      completion_tokens: logEntry.completion_tokens,
      total_tokens: logEntry.total_tokens,
      retry_attempt_count: logEntry.retry_attempt_count,
      cache_status: logEntry.cache_status,
    }).catch(() => {}); // fire-and-forget
  } catch (error) {
    console.error('Error writing log to stdout:', error);
  }
}

async function processLog(c: Context, start: number) {
  const ms = Date.now() - start;
  if (!c.req.url.includes('/v1/')) return;

  const requestOptionsArray = c.get('requestOptions');
  if (!requestOptionsArray?.length) {
    return;
  }

  try {
    const response = requestOptionsArray[0].requestParams.stream
      ? { message: 'The response was a stream.' }
      : await c.res.clone().json();

    const responseString = JSON.stringify(response);
    if (responseString.length > MAX_RESPONSE_LENGTH) {
      requestOptionsArray[0].response =
        responseString.substring(0, MAX_RESPONSE_LENGTH) + '...';
    } else {
      requestOptionsArray[0].response = response;
    }
  } catch (error) {
    console.error('Error processing log:', error);
  }

  await broadcastLog(
    JSON.stringify({
      time: new Date().toLocaleString(),
      method: c.req.method,
      endpoint: c.req.url.split(':8787')[1],
      status: c.res.status,
      duration: ms,
      requestOptions: requestOptionsArray,
    })
  );

  logToStdout(c, ms, requestOptionsArray);
}

export const logHandler = () => {
  return async (c: Context, next: any) => {
    c.set('addLogClient', addLogClient);
    c.set('removeLogClient', removeLogClient);

    const start = Date.now();

    await next();

    const runtime = getRuntimeKey();

    if (runtime == 'workerd') {
      c.executionCtx.waitUntil(processLog(c, start));
    } else if (['node', 'bun', 'deno'].includes(runtime)) {
      processLog(c, start).then().catch(console.error);
    }
  };
};
