/**
 * Portkey AI Gateway
 *
 * @module index
 */

import { Context, Hono } from 'hono';
import { prettyJSON } from 'hono/pretty-json';
import { basicAuth } from 'hono/basic-auth';
import { HTTPException } from 'hono/http-exception';
import { proxyHandler } from './handlers/proxyHandler';
import { chatCompletionsHandler } from './handlers/chatCompletionsHandler';
import { completionsHandler } from './handlers/completionsHandler';
import { embeddingsHandler } from './handlers/embeddingsHandler';
import { rerankHandler } from './handlers/rerankHandler';
import { requestValidator } from './middlewares/requestValidator';
import { imageGenerationsHandler } from './handlers/imageGenerationsHandler';
import { portkey } from './middlewares/portkey';
import { authNMiddleWare } from './middlewares/auth/authN';
import { customLogHandler } from './handlers/customLogHandler';
import { feedbackHandler } from './handlers/feedbackHandler';
import { logsGetHandler } from './handlers/logsGetHandler';
import { authZMiddleWare } from './middlewares/auth/authZ';
import { AUTH_SCOPES } from './globals';
import { register } from './apm/prometheus/prometheusClient';
import { initializeQueuesAndWorkers } from './redis-workers/queueWorkers';
import { redisClient } from './data-stores/redis/index';
import { shouldUseMemoryCache } from './data-stores/redis/config';
import { hooks } from './middlewares/hooks';
import { createSpeechHandler } from './handlers/createSpeechHandler';
import { createTranscriptionHandler } from './handlers/createTranscriptionHandler';
import { createTranslationHandler } from './handlers/createTranslationHandler';
import {
  proxyDataExportsHandler,
  proxyDataserviceHandler,
} from './handlers/proxyDataserviceHandler';
import { proxyAlbusRouteHandler } from './handlers/proxyAlbusRouteHandler';
import {
  finetuneCancelHandler,
  finetuneGetHandler,
  startFinetuneJobHandler,
} from './handlers/finetune';
import {
  createDatasetTransformer,
  datasetIdHandler,
} from './handlers/datasets';
import { tokenizerHandler } from './handlers/tokenizerHandler';
import filesHandler from './handlers/filesHandler';
import batchesHandler from './handlers/batchesHandler';
import finetuneHandler from './handlers/finetuneHandler';
import { durableObjectsHandler } from './handlers/durableObjectsHandler';
import { serviceAuthMiddleware } from './middlewares/auth/serviceAuth';
import { version } from '../package.json';
import { logger } from './apm';
import modelResponsesHandler from './handlers/modelResponsesHandler';
import { Environment } from './utils/env';
import { otelTracesHandler } from './handlers/otelTracesHandler';
import { messagesHandler } from './handlers/messagesHandler';
import { payloadSizeValidatorMiddleware } from './middlewares/payloadSizeValidator';
import { addMetricsMiddleware } from './middlewares/addMetricsMiddleware';
import { modelsHandler } from './handlers/modelsHandler';
import { messageCountTokensHandler } from './handlers/messageCountTokensHandler';
import { getCORSValues, setCorsHeaders } from './utils';
import { imageEditsHandler } from './handlers/imageEditsHandler';
import { getRuntimeKey } from 'hono/adapter';
import { realTimeHandler } from './handlers/realtimeHandler';
import { pingVerifyHandler } from './handlers/pingVerifyHandler';

// Create a new Hono server instance
const app = new Hono();
const runtime = getRuntimeKey();

if (runtime === 'node') {
  if (shouldUseMemoryCache()) {
    console.log('Using in-memory cache, skipping Redis initialization');
  } else {
    console.log('Waiting for Redis client to be ready...');
    await new Promise<void>((resolve) => {
      if (
        redisClient &&
        (redisClient.status === 'ready' || redisClient.status === 'connect')
      ) {
        resolve();
      } else {
        const checkInterval = setInterval(() => {
          if (
            redisClient &&
            (redisClient.status === 'ready' || redisClient.status === 'connect')
          ) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      }
    });
    console.log('Redis client is ready, initializing queues and workers');
    await initializeQueuesAndWorkers();
    console.log('Queues and workers initialized successfully');
  }
}

const { allowedOrigins, isCorsEnabled } = getCORSValues();

app.use('*', async (c, next) => {
  if (!isCorsEnabled) {
    return next();
  }

  const origin = c.req.header('Origin') || '';
  const isOriginAllowed =
    allowedOrigins.includes(origin) || allowedOrigins.includes('*');

  if (c.req.method === 'OPTIONS') {
    if (isOriginAllowed) {
      setCorsHeaders(c.res, origin);
    }
    return c.res;
  }

  await next();
  if (isOriginAllowed) {
    setCorsHeaders(c.res, origin);
  }
});

app.all(
  '/dataservice/bull-board/*',
  basicAuth({
    username: 'admin',
    password: Environment({}).PORTKEY_CLIENT_AUTH || 'admin',
  }),
  proxyDataserviceHandler
);
app.all('/dataservice/metrics', proxyDataserviceHandler);

// Prometheus metrics are only available in Node.js runtime
// Check if enabled via env (default: true for backward compatibility)
const isPrometheusEnabled =
  runtime === 'node' &&
  Environment({}).ENABLE_PROMETHEUS?.toLowerCase() !== 'false';

// Middleware for Prometheus metrics (only if enabled and in Node runtime)
if (isPrometheusEnabled) {
  app.use('*', addMetricsMiddleware());
}

app.get('/v1/health', (c) => {
  c.status(200);
  return c.json({
    status: 'success',
    message: 'Server is healthy',
    version,
  });
});

app.post('/v1/verify-ping', pingVerifyHandler);

/**
 * GET route for '/metrics'
 * Returns the metrics from the prometheus client
 * Only enabled in Node.js runtime when ENABLE_PROMETHEUS is not set to 'false'
 */
if (isPrometheusEnabled) {
  app.get('/metrics', async (c) => {
    c.header('Content-Type', register.contentType);
    return c.text(await register.metrics());
  });
}

app.post(
  '*',
  payloadSizeValidatorMiddleware(
    parseInt(Environment({}).MAX_JSON_PAYLOAD_SIZE_IN_MB)
  )
);

// Durable Objects handler - before authN, uses service auth instead
// Protected by service auth (PORTKEY_CLIENT_AUTH)
app.post('/v1/durable', serviceAuthMiddleware, durableObjectsHandler);
app.post('/v1/durable/*', serviceAuthMiddleware, durableObjectsHandler);

app.use('*', authNMiddleWare());
app.post(
  '/v1/prompts/:promptId/render',
  authZMiddleWare([AUTH_SCOPES.PROMPTS.RENDER]),
  portkey()
);

app.use('*', portkey());

// Support the /v1/models endpoint
app.get(
  '/v1/models',
  authZMiddleWare([
    AUTH_SCOPES.VIRTUAL_KEYS.LIST,
    AUTH_SCOPES.COMPLETIONS.WRITE,
  ]),
  modelsHandler
);

/**
 * GET route for the root path.
 * Returns a greeting message.
 */
app.get('/', (c) => c.text('AI Gateway says hey!'));

// Use prettyJSON middleware for all routes
app.use('*', prettyJSON());

app.use('*', hooks);

/**
 * Default route when no other route matches.
 * Returns a JSON response with a message and status code 404.
 */
app.notFound((c) => c.json({ message: 'Not Found', ok: false }, 404));

/**
 * Global error handler.
 * If error is instance of HTTPException, returns the custom response.
 * Otherwise, logs the error and returns a JSON response with status code 500.
 */
app.onError((err, c) => {
  logger.error(`Something went wrong :`, err);
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  c.status(500);
  return c.json({ status: 'failure', message: err.message });
});

/**
 * POST route for '/v1/messages' in anthropic format
 */
app.post(
  '/v1/messages',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator,
  messagesHandler
);

/**
 * POST route for '/v1/messages/count_tokens' in anthropic format
 */
app.post(
  '/v1/messages/count_tokens',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator,
  messageCountTokensHandler
);

/**
 * POST route for '/v1/chat/completions'.
 * Handles requests by passing them to the chatCompletionsHandler.
 */
app.post(
  '/v1/chat/completions',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator,
  chatCompletionsHandler
);

/**
 * POST route for '/v1/completions'.
 * Handles requests by passing them to the completionsHandler.
 */
app.post(
  '/v1/completions',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator,
  completionsHandler
);

/**
 * POST route for '/v1/embeddings'.
 * Handles requests by passing them to the embeddingsHandler.
 */
app.post(
  '/v1/embeddings',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator,
  embeddingsHandler
);

/**
 * POST route for '/v1/rerank'.
 * Handles requests by passing them to the rerankHandler.
 */
app.post(
  '/v1/rerank',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator,
  rerankHandler
);

/**
 * POST route for '/v1/images/generations'.
 * Handles requests by passing them to the imageGenerations handler.
 */
app.post(
  '/v1/images/generations',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator,
  imageGenerationsHandler
);

app.post(
  '/v1/images/edits',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator,
  imageEditsHandler
);

/**
 * POST route for '/v1/audio/speech'.
 * Handles requests by passing them to the createSpeechHandler.
 */
app.post(
  '/v1/audio/speech',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator,
  createSpeechHandler
);

/**
 * POST route for '/v1/audio/transcriptions'.
 * Handles requests by passing them to the createTranscriptionHandler.
 */
app.post(
  '/v1/audio/transcriptions',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator,
  createTranscriptionHandler
);

/**
 * POST route for '/v1/audio/translations'.
 * Handles requests by passing them to the createTranslationHandler.
 */
app.post(
  '/v1/audio/translations',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator,
  createTranslationHandler
);

// responses
app.post(
  '/v1/responses',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator,
  modelResponsesHandler('createModelResponse', 'POST')
);
app.get(
  '/v1/responses/:id',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator,
  modelResponsesHandler('getModelResponse', 'GET')
);
app.delete(
  '/v1/responses/:id',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator,
  modelResponsesHandler('deleteModelResponse', 'DELETE')
);
app.get(
  '/v1/responses/:id/input_items',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator,
  modelResponsesHandler('listResponseInputItems', 'GET')
);

/**
 * POST route for '/v1/prompts/:id/completions'.
 * Handles portkey prompt completions route
 */
app.post(
  '/v1/prompts/:promptId/completions',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator,
  (c: Context) => {
    const endpoint = c.get('promptCompletionsEndpoint');
    if (endpoint === 'chatComplete') {
      return chatCompletionsHandler(c);
    } else if (endpoint === 'complete') {
      return completionsHandler(c);
    }
    c.status(500);
    return c.json({
      status: 'failure',
      message: 'prompt completions error: Something went wrong',
    });
  }
);

app.all(
  '/v1/logs/exports/*',
  authZMiddleWare([AUTH_SCOPES.LOGS.EXPORT]),
  proxyDataExportsHandler
);

app.post(
  '/v1/logs',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE, AUTH_SCOPES.LOGS.WRITE]),
  customLogHandler
);
app.get(
  '/v1/logs/:id',
  authZMiddleWare([
    AUTH_SCOPES.LOGS.READ,
    AUTH_SCOPES.COMPLETIONS.WRITE,
    AUTH_SCOPES.LOGS.WRITE,
  ]),
  logsGetHandler
);
app.post(
  '/v1/otel/v1/traces',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE, AUTH_SCOPES.LOGS.WRITE]),
  otelTracesHandler
);
app.get(
  '/v1/pull/mongo/:id',
  authZMiddleWare([
    AUTH_SCOPES.LOGS.READ,
    AUTH_SCOPES.COMPLETIONS.WRITE,
    AUTH_SCOPES.LOGS.WRITE,
  ]),
  logsGetHandler
);

app.post(
  '/v1/feedback',
  authZMiddleWare([AUTH_SCOPES.LOGS.WRITE]),
  feedbackHandler
);
app.put(
  '/v1/feedback/:id',
  authZMiddleWare([AUTH_SCOPES.LOGS.WRITE]),
  feedbackHandler
);

// Proxy all finetune requests to finetune service
app.all(
  '/v1/dataservice/*',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  proxyDataserviceHandler
);

app.all(
  '/v1/finetune/*',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  proxyAlbusRouteHandler
);

app.post(
  '/v1/datasets',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  createDatasetTransformer
);

// files
app.get(
  '/v1/files',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator,
  filesHandler('listFiles', 'GET')
);
app.get(
  '/v1/files/:id',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator,
  filesHandler('retrieveFile', 'GET')
);
app.get(
  '/v1/files/:id/content',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator,
  filesHandler('retrieveFileContent', 'GET')
);
app.post(
  '/v1/files',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator,
  filesHandler('uploadFile', 'POST')
);
app.delete(
  '/v1/files/:id',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator,
  filesHandler('deleteFile', 'DELETE')
);

// batches
app.post(
  '/v1/batches',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator,
  batchesHandler('createBatch', 'POST')
);
app.get(
  '/v1/batches/:id',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator,
  batchesHandler('retrieveBatch', 'GET')
);
app.get(
  '/v1/batches/*/output',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator,
  batchesHandler('getBatchOutput', 'GET')
);
app.post(
  '/v1/batches/:id/cancel',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator,
  batchesHandler('cancelBatch', 'POST')
);
app.get(
  '/v1/batches',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator,
  batchesHandler('listBatches', 'GET')
);

app.post(
  '/v1/gateway/tokenize',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  tokenizerHandler
);

app.all(
  '/v1/fine_tuning/jobs/:jobId?/:cancel?',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator,
  finetuneHandler
);

app.on(
  ['GET', 'PUT'],
  '/v1/datasets/:id',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  datasetIdHandler
);

app.get(
  '/v1/fine-tuning/jobs/:jobId',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  finetuneGetHandler
);

app.post(
  '/v1/fine-tuning/jobs/:jobId',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  finetuneCancelHandler
);

app.post(
  `/v1/fine-tuning/jobs`,
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  startFinetuneJobHandler
);

// WebSocket route
if (runtime === 'workerd') {
  app.get(
    '/v1/realtime',
    authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
    realTimeHandler
  );
}

// write cancel handler

// Support the /v1 proxy endpoint after all defined endpoints so this does not interfere.
app.post(
  '/v1/*',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator.bind({ fn: 'proxy' }),
  proxyHandler
);

// Support the /v1 proxy endpoint after all defined endpoints so this does not interfere.
app.get(
  '/v1/:path{(?!realtime).*}',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator.bind({ fn: 'proxy' }),
  proxyHandler
);

app.delete(
  '/v1/*',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator.bind({ fn: 'proxy' }),
  proxyHandler
);

app.put(
  '/v1/*',
  authZMiddleWare([AUTH_SCOPES.COMPLETIONS.WRITE]),
  requestValidator.bind({ fn: 'proxy' }),
  proxyHandler
);

export default app;
export { AtomicCounterDO } from './services/cache/durable-objects/AtomicCounterDO';
export { RateLimiterDO } from './services/cache/durable-objects/RateLimiterDO';
export { CircuitBreakerDO } from './services/cache/durable-objects/CircuitBreakerDO';
