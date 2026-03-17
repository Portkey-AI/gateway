#!/usr/bin/env node
import tls from 'node:tls';
import { serve } from '@hono/node-server';
import { readFileSync } from 'node:fs';
import { createSecureServer } from 'node:http2';
import type { Options } from '@hono/node-server/dist/types';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Context } from 'hono';
import { streamSSE } from 'hono/streaming';

import app from './index';
import mcpApp from './mcp/mcp-index';
import { realTimeHandlerNode } from './handlers/realtimeHandlerNode';
import { stringcostRealtimeHandler } from './handlers/stringcostRealtimeHandler';
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
import { plugins } from './plugins';
import { loadExternalPlugins, mergePlugins } from './loaders/pluginLoader';
import { loadExternalMiddlewares } from './loaders/middlewareLoader';
import { loadExternalProviders } from './loaders/providerLoader';
import { registerProvider } from './providers';
import { installExternalDependencies } from './utils/externalDependencyInstaller';

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

const isHeadless = argv.headless;

// Parse external plugin, middleware, and provider directories
const pluginsDirArg = process.argv.find((arg) =>
  arg.startsWith('--plugins-dir=')
);
const pluginsDir = pluginsDirArg ? pluginsDirArg.split('=')[1] : null;

const middlewaresDirArg = process.argv.find((arg) =>
  arg.startsWith('--middlewares-dir=')
);
const middlewaresDir = middlewaresDirArg
  ? middlewaresDirArg.split('=')[1]
  : null;

const providersDirArg = process.argv.find((arg) =>
  arg.startsWith('--providers-dir=')
);
const providersDir = providersDirArg ? providersDirArg.split('=')[1] : null;

// Install external dependencies if external plugins/middlewares/providers are specified
const dirsToInstallDeps: string[] = [];
if (pluginsDir) dirsToInstallDeps.push(pluginsDir);
if (middlewaresDir) dirsToInstallDeps.push(middlewaresDir);
if (providersDir) dirsToInstallDeps.push(providersDir);

if (dirsToInstallDeps.length > 0) {
  console.log('📦 Installing external dependencies...');
  try {
    let packageJsonPath: string;

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const possiblePaths = [
      path.resolve('./package.json'),
      path.resolve('../package.json'),
      path.resolve(__dirname, '../../package.json'),
      path.resolve(process.cwd(), 'package.json'),
    ];

    let gatewayPackageJson: Record<string, any> | null = null;
    for (const tryPath of possiblePaths) {
      if (fs.existsSync(tryPath)) {
        try {
          const content = fs.readFileSync(tryPath, 'utf-8');
          gatewayPackageJson = JSON.parse(content);
          packageJsonPath = tryPath;
          break;
        } catch {
          // Continue to next path
        }
      }
    }

    if (!gatewayPackageJson) {
      throw new Error(
        'Could not find gateway package.json in any expected location'
      );
    }

    const installResult = await installExternalDependencies(
      dirsToInstallDeps,
      gatewayPackageJson
    );

    if (Object.keys(installResult.installed).length > 0) {
      console.log('✓ Dependencies installed for external packages\n');
    }

    if (Object.keys(installResult.peerDependencyMismatches).length > 0) {
      console.error('\n❌ Peer dependency mismatches detected:');
      for (const [dir, error] of Object.entries(
        installResult.peerDependencyMismatches
      )) {
        console.error(`  ${dir}: ${error}`);
      }
      process.exit(1);
    }

    if (Object.keys(installResult.failed).length > 0) {
      console.error('\n❌ Failed to install dependencies:');
      for (const [dir, error] of Object.entries(installResult.failed)) {
        console.error(`  ${dir}: ${error}`);
      }
      process.exit(1);
    }
  } catch (error: any) {
    console.error('❌ Error installing external dependencies:', error.message);
    process.exit(1);
  }
}

// Load external providers if specified
if (providersDir) {
  console.log('🔗 Loading external providers from:', providersDir);
  try {
    const externalProviders = await loadExternalProviders([providersDir]);

    for (const { name, config } of externalProviders) {
      registerProvider(name, config);
    }

    if (externalProviders.length > 0) {
      console.log('✓ External providers loaded\n');
    }
  } catch (error: any) {
    console.error('❌ Error loading providers:', error.message);
    process.exit(1);
  }
}

// Load external plugins if specified
if (pluginsDir) {
  console.log('🔌 Loading external plugins from:', pluginsDir);
  try {
    const externalPlugins = await loadExternalPlugins([pluginsDir]);
    const merged = mergePlugins(plugins, externalPlugins);
    Object.assign(plugins, merged);
    console.log('✓ External plugins loaded\n');
  } catch (error: any) {
    console.error('❌ Error loading plugins:', error.message);
    process.exit(1);
  }
}

// Load external middlewares if specified
if (middlewaresDir) {
  console.log('⚙️  Loading external middlewares from:', middlewaresDir);
  try {
    const externalMiddlewares = await loadExternalMiddlewares([middlewaresDir]);

    for (const mw of externalMiddlewares) {
      console.log(`  ↳ Registering middleware: ${mw.name}`);
      if (mw.appExtension) {
        (mw.handler as (app: any) => void)(app);
      } else {
        app.use(
          mw.pattern || '*',
          mw.handler as (c: any, next: any) => Promise<any>
        );
      }
    }

    console.log('✓ External middlewares loaded\n');
  } catch (error: any) {
    console.error('❌ Error loading middlewares:', error.message);
    process.exit(1);
  }
}

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
    const indexPath = join(scriptDir, 'public/index.html');
    const indexContent = readFileSync(indexPath, 'utf-8');

    const serveIndex = (c: Context) => {
      return c.html(indexContent);
    };

    app.get('/public/logs', serveIndex);
    app.get('/public/', serveIndex);
    app.get('/public', (c: Context) => {
      return c.redirect('/public/');
    });
  };

  await setupStaticServing();

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

    c.header('Cache-Control', 'no-cache');
    c.header('X-Accel-Buffering', 'no');

    return streamSSE(c, async (stream) => {
      const addLogClient: any = c.get('addLogClient');
      const removeLogClient: any = c.get('removeLogClient');

      const client = {
        sendLog: (message: any) =>
          sendWithTimeout(() => stream.writeSSE(message)),
      };
      addLogClient(clientId, client);

      const onAbort = () => {
        removeLogClient(clientId);
      };
      c.req.raw.signal.addEventListener('abort', onAbort);

      try {
        await sendWithTimeout(() =>
          stream.writeSSE({ event: 'connected', data: clientId })
        );

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
            clearInterval(heartbeatInterval);
            removeLogClient(clientId);
          }
        }, 10000);

        await new Promise((resolve) => {
          c.req.raw.signal.addEventListener('abort', () => {
            clearInterval(heartbeatInterval);
            resolve(undefined);
          });
        });
      } catch (error) {
        // silent
      } finally {
        removeLogClient(clientId);
        c.req.raw.signal.removeEventListener('abort', onAbort);
      }
    });
  });
}

const port = argv.port;
const mcpPort = argv['mcp-port'];

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

  // StringCost WebSocket proxy with token auth (bypasses authN/authZ via path check)
  app.get(
    '/stringcost-ws/t/:token/*',
    upgradeWebSocket(stringcostRealtimeHandler)
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
