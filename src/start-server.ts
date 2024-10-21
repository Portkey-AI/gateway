#!/usr/bin/env node

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static'
import { exec } from 'child_process';

import app from './index';

// Extract the port number from the command line arguments
const defaultPort = 8787;
const args = process.argv.slice(2);
const portArg = args.find((arg) => arg.startsWith('--port='));
const port = portArg ? parseInt(portArg.split('=')[1]) : defaultPort;

app.get('/public/*', serveStatic({ root: './' }));
app.get('/public/logs', serveStatic({ path: './public/index.html' }));

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

// Open the browser
openBrowser(`${url}/public/`);