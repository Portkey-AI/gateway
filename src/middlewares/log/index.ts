import { Context } from 'hono';

let logId = 0;

// Map to store all connected log clients
const logClients: any = new Map();

const addLogClient = (clientId: any, client: any) => {
  logClients.set(clientId, client);
  console.log(
    `New client ${clientId} connected. Total clients: ${logClients.size}`
  );
};

const removeLogClient = (clientId: any) => {
  logClients.delete(clientId);
  console.log(
    `Client ${clientId} disconnected. Total clients: ${logClients.size}`
  );
};

const broadcastLog = async (log: any) => {
  const message = {
    data: log,
    event: 'log',
    id: String(logId++),
  };

  const deadClients: any = [];

  for (const [id, client] of logClients) {
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
  }

  // Remove dead clients after iteration
  deadClients.forEach((id: any) => {
    removeLogClient(id);
  });
};

export const logger = () => {
  return async (c: Context, next: any) => {
    c.set('addLogClient', addLogClient);
    c.set('removeLogClient', removeLogClient);

    const start = Date.now();

    await next();

    const ms = Date.now() - start;
    if (!c.req.url.includes('/v1/')) return;

    const requestOptionsArray = c.get('requestOptions');
    if (requestOptionsArray[0].requestParams.stream) {
      requestOptionsArray[0].response = {
        message: 'The response was a stream.',
      };
    } else {
      const response = await c.res.clone().json();
      requestOptionsArray[0].response = response;
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
  };
};
