#!/usr/bin/env node

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { exec } from 'child_process';

import app from './index';
import { streamSSE } from 'hono/streaming';
import { Context } from 'hono';

// Extract the port number from the command line arguments
const defaultPort = 8787;
const args = process.argv.slice(2);
const portArg = args.find((arg) => arg.startsWith('--port='));
const port = portArg ? parseInt(portArg.split('=')[1]) : defaultPort;

const isHeadless = args.includes('--headless');

if (!isHeadless && process.env.NODE_ENV !== 'production') {
  app.get('/public/*', serveStatic({ root: './' }));
  app.get('/public/logs', serveStatic({ path: './public/index.html' }));

  app.get('/log/stream', (c: Context) => {
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
      const removeLogClient: any = c.get('removeLogClient');
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
        removeLogClient(clientId);
      } finally {
        // Remove this client when the connection is closed
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
  // In Docker container, just log the URL in a clickable format
  if (process.env.DOCKER || process.env.CONTAINER) {
    console.log('\n🔗 Access your AI Gateway at: \x1b[36m%s\x1b[0m\n', url);
    command = ''; // No-op for Docker/containers
  } else {
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
  }

  if (command) {
    exec(command, (error) => {
      if (error) {
        console.log('\n🔗 Access your AI Gateway at: \x1b[36m%s\x1b[0m\n', url);
      }
    });
  }
}

// Open the browser only when --headless is not provided
if (!isHeadless) {
  openBrowser(`${url}/public/`);
}
