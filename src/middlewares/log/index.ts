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

  for (const requestOption of requestOptionsArray) {
    if (requestOption.type === 'otel') {
      console.log('otel', JSON.stringify(requestOption));
      continue;
    }

    console.log(requestOption.type || 'requestOption', requestOption);

    try {
      const response = requestOption.requestParams.stream
        ? { message: 'The response was a stream.' }
        : await c.res.clone().json();

      const responseString = JSON.stringify(response);
      if (responseString.length > MAX_RESPONSE_LENGTH) {
        requestOption.response =
          responseString.substring(0, MAX_RESPONSE_LENGTH) + '...';
      } else {
        requestOption.response = response;
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
        requestOptions: requestOption,
      })
    );
  }
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
