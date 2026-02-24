#!/usr/bin/env node
import tls from 'node:tls';
import { serve } from '@hono/node-server';
import { readFileSync } from 'node:fs';
import { createSecureServer } from 'node:http2';
import type { Options } from '@hono/node-server/dist/types';
import app from './index';
import mcpApp from './mcp/mcp-index';
import { realTimeHandlerNode } from './handlers/realtimeHandlerNode';
import { createNodeWebSocket } from '@hono/node-ws';
import { authZMiddleWare } from './middlewares/auth/authZ';
import { AUTH_SCOPES } from './globals';
import { requestValidator } from './middlewares/requestValidator';
import { AnalyticsBatcher } from './services/analyticsBatcher';
import { buildAgents } from './agentStore';
import { Environment } from './utils/env';
import minimist from 'minimist';
import { Server } from 'node:https';
import { initClickhouse } from './data-stores/clickhouse';
import { initMongo } from './data-stores/mongo';
import { initializeMemCache } from './data-stores/memCache';
import { initCacheKeyTracker } from './utils/cacheKeyTracker';

const TIMEOUT = 15 * 60 * 1000; // 15 minutes

await initClickhouse();
await initMongo();
initializeMemCache();

// Extract the port number from the command line arguments
const argv = minimist(process.argv.slice(2), {
  default: {
    port: Number(Environment({}).PORT),
    'mcp-port': Number(Environment({}).MCP_PORT),
  },
  boolean: ['llm-node', 'mcp-node', 'llm-grpc', 'headless'],
});

const port = argv.port;
const mcpPort = argv['mcp-port'];

// Add flags to choose what all to start (llm-node, llm-grpc, mcp-node)
// Default starts both llm-node and mcp-node

let llmNode = argv['llm-node'];
let mcpNode = argv['mcp-node'];
let llmGrpc = argv['llm-grpc'];

if (!llmNode && !mcpNode && !llmGrpc) {
  llmNode = true;
}

const tlsKeyPath = Environment({}).TLS_KEY_PATH;
const tlsCertPath = Environment({}).TLS_CERT_PATH;
const tlsCaPath = Environment({}).TLS_CA_PATH;

let tlsKey = Environment({}).TLS_KEY;
let tlsCert = Environment({}).TLS_CERT;
let tlsCa = Environment({}).TLS_CA;
const defaultCAs = tls.rootCertificates;

if (tlsKeyPath && tlsCertPath) {
  try {
    tlsKey = readFileSync(tlsKeyPath, 'utf-8');
    tlsCert = readFileSync(tlsCertPath, 'utf-8');
    if (tlsCaPath) {
      tlsCa = readFileSync(tlsCaPath, 'utf-8');
    }
  } catch (error) {
    console.error('Error reading TLS keys:', error);
  }
}

const agentConfig: any = {};

// Configure TLS for all agents (automatically builds agents with proxy/timeout/TLS)
if ((tlsKey && tlsCert) || tlsCa) {
  agentConfig.options = {
    ...(tlsKey && { key: tlsKey }),
    ...(tlsCert && { cert: tlsCert }),
    ...(tlsCa ? { ca: [...defaultCAs, tlsCa] } : {}),
    allowHTTP1: true,
  };
}

buildAgents(agentConfig);

if (mcpNode) {
  const mcpUrl = `http://localhost:${mcpPort}`;
  const mcpServerOptions: Options = {
    fetch: mcpApp.fetch,
    port: mcpPort,
  };

  if (tlsKeyPath && tlsCertPath) {
    mcpServerOptions.createServer = createSecureServer;
  }

  if ((tlsKey && tlsCert) || tlsCa) {
    mcpServerOptions.serverOptions = agentConfig.options;
  }

  const mcpServer = serve(mcpServerOptions) as Server;
  mcpServer.setTimeout(TIMEOUT);
  mcpServer.requestTimeout = TIMEOUT;
  mcpServer.headersTimeout = TIMEOUT;

  console.log('\x1b[1m%s\x1b[0m', '🤯 MCP Gateway is running at:');
  console.log('   ' + '\x1b[1;4;32m%s\x1b[0m', `${mcpUrl}`);
}

if (llmNode) {
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

  app.get(
    '/v1/realtime',
    authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
    requestValidator,
    upgradeWebSocket(realTimeHandlerNode)
  );

  const serverOptions: Options = {
    fetch: app.fetch,
    port: port,
  };

  if (tlsKeyPath && tlsCertPath) {
    serverOptions.createServer = createSecureServer;
  }

  if ((tlsKey && tlsCert) || tlsCa) {
    serverOptions.serverOptions = agentConfig.options;
  }

  const server = serve(serverOptions) as Server;

  initCacheKeyTracker();

  server.setTimeout(TIMEOUT);
  server.requestTimeout = TIMEOUT;
  server.headersTimeout = TIMEOUT;

  injectWebSocket(server);
  console.log(`Your AI Gateway is now running on http://localhost:${port} 🚀`);
}

// Add a cleanup function to flush remaining items on process exit
process.on('SIGTERM', async () => {
  if (AnalyticsBatcher.getInstance()) {
    await AnalyticsBatcher.getInstance().flush();
  }
});

process.on('SIGINT', async () => {
  if (AnalyticsBatcher.getInstance()) {
    await AnalyticsBatcher.getInstance().flush();
  }
});

process.on('uncaughtException', (err) => {
  console.error('Unhandled exception', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection', err);
});
