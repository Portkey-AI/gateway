#!/usr/bin/env node

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { exec } from 'child_process';

import app from './index';
import { streamSSE } from 'hono/streaming';

// Extract the port number from the command line arguments
const defaultPort = 8787;
const args = process.argv.slice(2);
console.log(args, process.argv);
const portArg = args.find((arg) => arg.startsWith('--port='));
const port = portArg ? parseInt(portArg.split('=')[1]) : defaultPort;

const isHeadless = args.includes('--headless');

if (!isHeadless) {
  app.get('/public/*', serveStatic({ root: './' }));
  app.get('/public/logs', serveStatic({ path: './public/index.html' }));

  app.get('/log/stream', (c) => {
    const clientId = Date.now().toString();

    // Set headers to prevent caching
    c.header('Cache-Control', 'no-cache');
    c.header('X-Accel-Buffering', 'no');

    return streamSSE(c, async (stream) => {
      const client = {
        sendLog: (message: any) => stream.writeSSE(message),
      };
      // Add this client to the set of log clients
      const addLogClient: any = c.get('addLogClient');
      addLogClient(clientId, client);

      try {
        // Send an initial connection event
        await stream.writeSSE({ event: 'connected', data: clientId });

        // Keep the connection open
        while (true) {
          await stream.sleep(10000); // Heartbeat every 10 seconds
          await stream.writeSSE({ event: 'heartbeat', data: 'pulse' });
        }
      } catch (error) {
        console.error(`Error in log stream for client ${clientId}:`, error);
      } finally {
        // Remove this client when the connection is closed
        const removeLogClient: any = c.get('removeLogClient');
        removeLogClient(clientId);
      }
    });
  });
}

serve({
  fetch: app.fetch,
  port: port,
});

const url = `http://localhost:${port}`;
console.log(`Your AI Gateway is now running on ${url} 🚀`);

// Function to open URL in the default browser
function openBrowser(url: string) {
  let command: string;
  switch (process.platform) {
    case 'darwin':
      command = `open ${url}`;
      break;
    case 'win32':
      command = `start ${url}`;
      break;
    default:
      command = `xdg-open ${url}`;
  }

  exec(command, (error) => {
    if (error) {
      console.error('Failed to open browser:', error);
    }
  });
}

// Open the browser only when --headless is not provided
if (!isHeadless) {
  openBrowser(`${url}/public/`);
}
