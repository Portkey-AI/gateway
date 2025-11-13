import { Context } from 'hono';
import { getRuntimeKey } from 'hono/adapter';

let logId = 0;
const MAX_RESPONSE_LENGTH = 100000;

// Log level control via environment variable
// Set LOG_LEVEL=verbose for detailed console logs
// Set LOG_LEVEL=minimal for basic logs only
// Set LOG_LEVEL=silent to disable console logs
// Default to verbose logging if not set or set to an invalid value
const LOG_LEVEL = process.env.LOG_LEVEL || 'verbose';

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

async function processLog(c: Context, start: number) {
  const ms = Date.now() - start;
  if (!c.req.url.includes('/v1/')) return;

  const requestOptionsArray = c.get('requestOptions');
  if (!requestOptionsArray?.length) {
    return;
  }

  // Capture the final response body sent to the client
  // Note: requestOptionsArray is ordered chronologically (first attempt at [0], last at [-1])
  // The last element contains the final successful (or failed) response
  const lastAttemptIndex = requestOptionsArray.length - 1;
  let finalClientResponse = null;
  try {
    finalClientResponse = requestOptionsArray[lastAttemptIndex]
      .finalUntransformedRequest.body.stream
      ? { message: 'The response was a stream.' }
      : await c.res.clone().json();

    const responseString = JSON.stringify(finalClientResponse);
    if (responseString.length > MAX_RESPONSE_LENGTH) {
      requestOptionsArray[lastAttemptIndex].response =
        responseString.substring(0, MAX_RESPONSE_LENGTH) + '...';
    } else {
      requestOptionsArray[lastAttemptIndex].response = finalClientResponse;
    }
  } catch (error) {
    console.error('Error processing log:', error);
  }

  const now = new Date();
  const timestamp = now.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });

  // Extract the endpoint path from the URL
  const url = new URL(c.req.url);
  const endpoint = url.pathname + url.search;

  const logData = {
    time: timestamp,
    method: c.req.method,
    endpoint: endpoint,
    status: c.res.status,
    duration: ms,
    requestOptions: requestOptionsArray,
  };

  // Log to console for STDOUT visibility based on LOG_LEVEL
  if (LOG_LEVEL !== 'silent') {
    if (LOG_LEVEL === 'minimal') {
      // Minimal logging: just method, endpoint, status, duration
      console.log(
        `[${logData.time}] ${logData.method} ${logData.endpoint} - ${logData.status} (${ms}ms)`
      );
    } else {
      // Verbose logging: full details (default)
      console.log('\n' + '='.repeat(80));
      console.log(`[${logData.time}] ${logData.method} ${logData.endpoint}`);
      console.log(`Status: ${logData.status} | Duration: ${ms}ms`);
      console.log('-'.repeat(80));

      // Log incoming client request (Client -> Gateway)
      console.log('\nINCOMING REQUEST (Client -> Gateway):');
      console.log('\nClient Headers:');
      const headers: Record<string, string> = {};
      c.req.raw.headers.forEach((value, key) => {
        headers[key] = value;
      });
      console.log(JSON.stringify(headers, null, 2));

      // Log original request body if available
      // Note: Client request body is the same across all attempts, so we can use any element
      if (requestOptionsArray[0]?.finalUntransformedRequest?.body) {
        console.log('\nClient Request Body:');
        console.log(
          JSON.stringify(
            requestOptionsArray[0].finalUntransformedRequest.body,
            null,
            2
          )
        );
      }

      console.log('\n' + '-'.repeat(80));

      // Log all attempts (useful for retries, fallbacks, load balancing)
      console.log('\nOUTGOING REQUESTS (Gateway -> Provider):');
      requestOptionsArray.forEach((option: any, index: number) => {
        if (requestOptionsArray.length > 1) {
          console.log(
            `\n--- Attempt ${index + 1} of ${requestOptionsArray.length} ---`
          );
        }

        // Log provider and model info
        if (option.providerOptions) {
          console.log('Provider:', option.providerOptions?.provider || 'N/A');
          console.log(
            'Request URL:',
            option.providerOptions?.requestURL || 'N/A'
          );
        }

        // Log request parameters
        if (option.requestParams) {
          console.log('\nRequest Parameters:');
          console.log(JSON.stringify(option.requestParams, null, 2));
        }

        // Log response from provider
        if (option.response) {
          console.log('\nProvider Response:');
          console.log(JSON.stringify(option.response, null, 2));
        }
      });

      // Log final response back to client (Gateway -> Client)
      console.log('\n' + '-'.repeat(80));
      console.log('\nOUTGOING RESPONSE (Gateway -> Client):');
      console.log(`\nStatus: ${c.res.status}`);
      console.log('\nResponse Headers:');
      const responseHeaders: Record<string, string> = {};
      c.res.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      console.log(JSON.stringify(responseHeaders, null, 2));

      // Log the actual response body sent to client
      if (finalClientResponse) {
        console.log('\nResponse Body:');
        console.log(JSON.stringify(finalClientResponse, null, 2));
      }

      console.log('\n' + '='.repeat(80) + '\n');
    }
  }

  // Broadcast to SSE clients
  await broadcastLog(JSON.stringify(logData));
}

export const logger = () => {
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
