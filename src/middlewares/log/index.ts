import { Context } from 'hono';
import { getRuntimeKey } from 'hono/adapter';

let logId = 0;
const MAX_RESPONSE_LENGTH = 100000;

// Map to store all connected log clients
const logClients: Map<string | number, any> = new Map();

const addLogClient = (clientId: any, client: any) => {
  logClients.set(clientId, client);
};

const removeLogClient = (clientId: any) => {
  logClients.delete(clientId);
};

const sanitizeHeaders = (headers: Record<string, unknown> = {}) =>
  Object.fromEntries(Object.keys(headers).map((key) => [key, '[REDACTED]']));

const ALLOWED_PROVIDER_OPTION_KEYS = new Set([
  'provider',
  'overrideParams',
  'retry',
  'cache',
  'requestURL',
  'rubeusURL',
]);

const sanitizeProviderOptions = (
  providerOptions: Record<string, unknown> = {}
) =>
  Object.fromEntries(
    Object.entries(providerOptions).map(([key, value]) => [
      key,
      ALLOWED_PROVIDER_OPTION_KEYS.has(key) ? value : '[REDACTED]',
    ])
  );

const sanitizeRequestOption = (requestOption: any) => {
  if (!requestOption || typeof requestOption !== 'object') return requestOption;

  const sanitizedOption = { ...requestOption };

  if (
    sanitizedOption.providerOptions &&
    typeof sanitizedOption.providerOptions === 'object'
  ) {
    sanitizedOption.providerOptions = sanitizeProviderOptions(
      sanitizedOption.providerOptions as Record<string, unknown>
    );
  }

  if (
    sanitizedOption.transformedRequest &&
    typeof sanitizedOption.transformedRequest === 'object'
  ) {
    sanitizedOption.transformedRequest = {
      ...sanitizedOption.transformedRequest,
    };
    if (sanitizedOption.transformedRequest.headers) {
      sanitizedOption.transformedRequest.headers = sanitizeHeaders(
        sanitizedOption.transformedRequest.headers as Record<string, unknown>
      );
    }
  }

  if (
    sanitizedOption.responseHeaders &&
    typeof sanitizedOption.responseHeaders === 'object'
  ) {
    sanitizedOption.responseHeaders = sanitizeHeaders(
      sanitizedOption.responseHeaders as Record<string, unknown>
    );
  }

  return sanitizedOption;
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
      requestOptions: requestOptionsArray.map(sanitizeRequestOption),
    })
  );
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
