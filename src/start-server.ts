#!/usr/bin/env node

import { serve } from '@hono/node-server';

import app from './index';
import { streamSSE } from 'hono/streaming';
import { Context } from 'hono';
import { createNodeWebSocket } from '@hono/node-ws';
import { realTimeHandlerNode } from './handlers/realtimeHandlerNode';
import { requestValidator } from './middlewares/requestValidator';

// Extract the port number from the command line arguments
const defaultPort = 8787;
const args = process.argv.slice(2);
const portArg = args.find((arg) => arg.startsWith('--port='));
const port = portArg ? parseInt(portArg.split('=')[1]) : defaultPort;

const isHeadless = args.includes('--headless');

// Setup static file serving only if not in headless mode
if (
  !isHeadless &&
  !(
    process.env.NODE_ENV === 'production' ||
    process.env.ENVIRONMENT === 'production'
  )
) {
  const setupStaticServing = async () => {
    const { join, dirname } = await import('path');
    const { fileURLToPath } = await import('url');
    const { readFileSync } = await import('fs');

    const scriptDir = dirname(fileURLToPath(import.meta.url));

    // Serve the index.html content directly for both routes
    const indexPath = join(scriptDir, 'public/index.html');
    const indexContent = readFileSync(indexPath, 'utf-8');

    const serveIndex = (c: Context) => {
      return c.html(indexContent);
    };

    // Set up routes
    app.get('/public/logs', serveIndex);
    app.get('/public/', serveIndex);

    // Redirect `/public` to `/public/`
    app.get('/public', (c: Context) => {
      return c.redirect('/public/');
    });
  };

  // Initialize static file serving
  await setupStaticServing();

  /**
   * A helper function to enforce a timeout on SSE sends.
   * @param fn A function that returns a Promise (e.g. stream.writeSSE())
   * @param timeoutMs The timeout in milliseconds (default: 2000)
   */
  async function sendWithTimeout(fn: () => Promise<void>, timeoutMs = 200) {
    const timeoutPromise = new Promise<void>((_, reject) => {
      const id = setTimeout(() => {
        clearTimeout(id);
        reject(new Error('Write timeout'));
      }, timeoutMs);
    });

    return Promise.race([fn(), timeoutPromise]);
  }

  app.get('/log/stream', (c: Context) => {
    const clientId = Date.now().toString();

    // Set headers to prevent caching
    c.header('Cache-Control', 'no-cache');
    c.header('X-Accel-Buffering', 'no');

    return streamSSE(c, async (stream) => {
      const addLogClient: any = c.get('addLogClient');
      const removeLogClient: any = c.get('removeLogClient');

      const client = {
        sendLog: (message: any) =>
          sendWithTimeout(() => stream.writeSSE(message)),
      };
      // Add this client to the set of log clients
      addLogClient(clientId, client);

      // If the client disconnects (closes the tab, etc.), this signal will be aborted
      const onAbort = () => {
        removeLogClient(clientId);
      };
      c.req.raw.signal.addEventListener('abort', onAbort);

      try {
        // Send an initial connection event
        await sendWithTimeout(() =>
          stream.writeSSE({ event: 'connected', data: clientId })
        );

        // Use an interval instead of a while loop
        const heartbeatInterval = setInterval(async () => {
          if (c.req.raw.signal.aborted) {
            clearInterval(heartbeatInterval);
            return;
          }

          try {
            await sendWithTimeout(() =>
              stream.writeSSE({ event: 'heartbeat', data: 'pulse' })
            );
          } catch (error) {
            // console.error(`Heartbeat failed for client ${clientId}:`, error);
            clearInterval(heartbeatInterval);
            removeLogClient(clientId);
          }
        }, 10000);

        // Wait for abort signal
        await new Promise((resolve) => {
          c.req.raw.signal.addEventListener('abort', () => {
            clearInterval(heartbeatInterval);
            resolve(undefined);
          });
        });
      } catch (error) {
        // console.error(`Error in log stream for client ${clientId}:`, error);
      } finally {
        // Remove this client when the connection is closed
        removeLogClient(clientId);
        c.req.raw.signal.removeEventListener('abort', onAbort);
      }
    });
  });
}

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.get(
  '/v1/realtime',
  requestValidator,
  upgradeWebSocket(realTimeHandlerNode)
);

const server = serve({
  fetch: app.fetch,
  port: port,
});

const url = `http://localhost:${port}`;

injectWebSocket(server);

// Loading animation function
async function showLoadingAnimation() {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;

  return new Promise((resolve) => {
    const interval = setInterval(() => {
      process.stdout.write(`\r${frames[i]} Starting AI Gateway...`);
      i = (i + 1) % frames.length;
    }, 80);

    // Stop after 1 second
    setTimeout(() => {
      clearInterval(interval);
      process.stdout.write('\r');
      resolve(undefined);
    }, 1000);
  });
}

// Clear the console and show animation before main output
console.clear();
await showLoadingAnimation();

// Main server information with minimal spacing
console.log('\x1b[1m%s\x1b[0m', '🚀 Your AI Gateway is running at:');
console.log('   ' + '\x1b[1;4;32m%s\x1b[0m', `${url}`);

// Secondary information on single lines
if (!isHeadless) {
  console.log('\n\x1b[90m📱 UI:\x1b[0m \x1b[36m%s\x1b[0m', `${url}/public/`);
}
// console.log('\x1b[90m📚 Docs:\x1b[0m \x1b[36m%s\x1b[0m', 'https://portkey.ai/docs');

// Single-line ready message
console.log('\n\x1b[32m✨ Ready for connections!\x1b[0m');
