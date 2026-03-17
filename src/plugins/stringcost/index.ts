/**
 * StringCost plugin for Portkey gateway.
 * Provides O(1) blocking checks (guardrail) and async cost logging (logEvent).
 */
import { PgBoss } from 'pg-boss';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Global singletons (shared with realtimeEventLogger)
// ---------------------------------------------------------------------------
const globalState = globalThis as any;

async function getDatabasePool(): Promise<any> {
  if (globalState._stringcostPool) {
    return globalState._stringcostPool;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL must be configured for stringcost plugin');
  }
  const { Pool } = await import('pg');
  globalState._stringcostPool = new Pool({
    connectionString,
    max: 3,
    min: 0,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
  });
  console.log('[stringcost-plugin] database pool created');
  return globalState._stringcostPool;
}

async function getBoss(): Promise<PgBoss> {
  if (globalState._stringcostBossPromise) {
    return globalState._stringcostBossPromise as Promise<PgBoss>;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL must be configured for job queue');
  }
  // noMigration: pgboss schema is created by knex migrations, not by pg-boss itself
  const boss = new PgBoss({ connectionString, noMigration: true } as any);
  globalState._stringcostBossPromise = boss
    .start()
    .then(async () => {
      console.log('[stringcost-plugin] pg-boss started');
      await boss.createQueue('classification', { retryLimit: 5 } as any);
      return boss;
    })
    .catch((error: Error) => {
      console.error('[stringcost-plugin] Failed to start pg-boss:', error?.message);
      throw error;
    });
  return globalState._stringcostBossPromise as Promise<PgBoss>;
}

// ---------------------------------------------------------------------------
// Context types
// ---------------------------------------------------------------------------
interface HookSpanContextRequest {
  text: string;
  json: any;
  isStreamingRequest: boolean;
  isTransformed: boolean;
  headers: Record<string, string>;
}

interface HookSpanContextResponse {
  text: string;
  json: any;
  statusCode: number | null;
  isTransformed: boolean;
}

interface HookSpanContext {
  request: HookSpanContextRequest;
  response: HookSpanContextResponse;
  provider: string;
  requestType: string;
  metadata?: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sanitizeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const urlObj = new URL(url);
    for (const param of ['key', 'apikey', 'api_key', 'token', 'access_token', 'auth']) {
      if (urlObj.searchParams.has(param)) urlObj.searchParams.set(param, '***');
    }
    return urlObj.toString();
  } catch {
    return '[invalid-url]';
  }
}

function resolveEffectiveModel(
  metadata: Record<string, any>,
  requestJson: any
): string | null {
  const requestModel =
    typeof requestJson?.model === 'string' ? requestJson.model : null;
  const existingModel =
    typeof metadata.metadata?.model === 'string' ? metadata.metadata.model : null;
  if (requestModel) {
    metadata.metadata = { ...(metadata.metadata ?? {}), model: requestModel };
    return requestModel;
  }
  return existingModel || null;
}

function buildStreamingResponseSnapshot(context: HookSpanContext) {
  if (!context.response.text) return null;
  return { type: 'streaming_text', text: context.response.text };
}

function buildJobPayload(
  metadata: Record<string, any>,
  context: HookSpanContext,
  modelIdOverride?: string | null
): any {
  const runId = metadata.runId ?? metadata.sessionId;
  const userId = metadata.userId ?? metadata.sessionId ?? randomUUID();
  const provider = metadata.provider ?? null;
  const modelId =
    modelIdOverride ??
    resolveEffectiveModel(metadata, context.request.json) ??
    metadata.provider ??
    null;

  const isAudioApi =
    context.requestType === 'createTranscription' ||
    context.requestType === 'createTranslation' ||
    context.requestType === 'createSpeech';

  const hasJson =
    context.response.json && Object.keys(context.response.json).length > 0;
  let snapshot: any = null;
  if (hasJson) {
    snapshot = JSON.parse(JSON.stringify(context.response.json));
  } else if (context.response.text) {
    snapshot = buildStreamingResponseSnapshot(context);
  } else {
    snapshot = {
      type: 'binary_response',
      statusCode: context.response.statusCode,
      contentType: 'audio/*',
    };
  }

  return {
    eventId: randomUUID(),
    runId,
    userId,
    clientId: metadata.clientId ?? null,
    outcome:
      context.response.statusCode && context.response.statusCode >= 400
        ? 'error'
        : 'success',
    actionType: isAudioApi ? 'audio_api' : 'chat_completion',
    costCogsMicros: 0,
    revenueBilledMicros: 0,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    metadata: {
      ...(metadata.metadata ?? {}),
      isAudioApi,
      requestType: context.requestType,
    },
    sessionId: metadata.sessionId ?? null,
    externalSession: metadata.externalSession ?? null,
    externalUser: metadata.externalUser ?? null,
    provider,
    modelId,
    promptContent: context.request.text ?? null,
    requestBody: context.request.json,
    responseBody: snapshot,
    responseText: context.response.text ?? null,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Hook: guardrail (beforeRequestHook)
// ---------------------------------------------------------------------------
export async function guardrail(
  context: HookSpanContext,
  _parameters: Record<string, any>,
  eventType: 'beforeRequestHook' | 'afterRequestHook'
): Promise<{ verdict: boolean; error: Error | null; data?: any }> {
  if (eventType !== 'beforeRequestHook') {
    return { verdict: true, error: null };
  }

  const metadata = (context.metadata as Record<string, any>)?.stringcost ?? null;
  if (!metadata || !metadata.clientId) {
    return { verdict: true, error: null };
  }

  try {
    const db = await getDatabasePool();
    const result = await db.query(
      'SELECT 1 FROM blocked_clients WHERE client_id = $1',
      [metadata.clientId]
    );
    if ((result.rowCount ?? 0) > 0) {
      console.warn('[stringcost-plugin] client blocked', {
        clientId: metadata.clientId,
      });
      return {
        verdict: false,
        error: null,
        data: { reason: 'Quota exceeded. Account blocked.' },
      };
    }

    // Session max_uses check
    if (metadata.sessionId) {
      const sessionResult = await db.query(
        'SELECT usage_count, max_uses FROM signed_url_sessions WHERE session_id = $1',
        [metadata.sessionId]
      );
      if (sessionResult.rows.length > 0) {
        const { usage_count, max_uses } = sessionResult.rows[0];
        const isLimited = max_uses !== null && max_uses !== -1;
        if (isLimited && usage_count > max_uses) {
          console.warn('[stringcost-plugin] session max_uses exceeded', {
            sessionId: metadata.sessionId,
          });
          return {
            verdict: false,
            error: null,
            data: {
              reason: `Maximum uses (${max_uses}) exceeded for this session`,
            },
          };
        }
      }
    }

    // Session cost_limit check
    if (metadata.sessionId) {
      const blockedResult = await db.query(
        'SELECT 1 FROM blocked_sessions WHERE session_id = $1',
        [metadata.sessionId]
      );
      if ((blockedResult.rowCount ?? 0) > 0) {
        console.warn('[stringcost-plugin] session blocked - cost limit exceeded', {
          sessionId: metadata.sessionId,
        });
        return {
          verdict: false,
          error: null,
          data: { reason: 'Session cost limit exceeded' },
        };
      }
    }

    return { verdict: true, error: null };
  } catch (error) {
    console.error('[stringcost-plugin] blocking check failed', error);
    return { verdict: true, error: null }; // fail open
  }
}

// ---------------------------------------------------------------------------
// Hook: logEvent (afterRequestHook)
// ---------------------------------------------------------------------------
export async function logEvent(
  spanContext: HookSpanContext,
  _parameters: Record<string, any>,
  eventType: 'beforeRequestHook' | 'afterRequestHook'
): Promise<{ verdict: boolean; error: Error | null; data?: any }> {
  if (eventType !== 'afterRequestHook') {
    return { verdict: true, error: null };
  }

  const metadata =
    (spanContext.metadata as Record<string, any>)?.stringcost ?? null;
  if (!metadata) {
    return { verdict: true, error: null };
  }

  try {
    const effectiveModel = resolveEffectiveModel(
      metadata,
      spanContext.request.json
    );
    const jobPayload = buildJobPayload(metadata, spanContext, effectiveModel);

    const isEmptyJson =
      typeof jobPayload.responseBody === 'object' &&
      jobPayload.responseBody !== null &&
      Object.keys(jobPayload.responseBody as object).length === 0;
    const hasNoResponse = !jobPayload.responseBody && !jobPayload.responseText;
    const isBinaryResponse =
      jobPayload.responseBody?.type === 'binary_response';

    if (hasNoResponse || (isEmptyJson && !isBinaryResponse)) {
      console.log('[stringcost-plugin] skipping event log - no response body', {
        hasNoResponse,
        isEmptyJson,
        statusCode: spanContext.response.statusCode,
      });
      return { verdict: true, error: null };
    }

    const boss = await getBoss();
    await boss.send('classification', jobPayload);

    console.log('[stringcost-plugin] job queued', {
      eventId: jobPayload.eventId,
      actionType: jobPayload.actionType,
      outcome: jobPayload.outcome,
    });
    return { verdict: true, error: null, data: { queued: true } };
  } catch (error) {
    console.error('[stringcost-plugin] logEvent failed', error);
    return { verdict: true, error: error as Error };
  }
}

// ---------------------------------------------------------------------------
// realtimeEventLogger — used by stringcostRealtimeHandler for WebSocket APIs
// ---------------------------------------------------------------------------
export async function realtimeEventLogger(
  sessionOptions: any,
  conversationSnapshot: any,
  eventData: any,
  eventType: string
): Promise<void> {
  try {
    const meta = sessionOptions.requestHeaders || {};
    const sessionId: string = meta['x-stringcost-session-id'];
    const userId: string = meta['x-stringcost-user-id'];
    const clientId: string = meta['x-stringcost-client-id'];
    const provider: string = meta['x-stringcost-provider'];
    const externalSession: string | null =
      meta['x-stringcost-external-session'] || null;
    const externalUser: string | null =
      meta['x-stringcost-external-user'] || null;

    if (!sessionId || !userId || !clientId) {
      console.warn(
        '[stringcost-plugin] realtimeEventLogger: missing required metadata'
      );
      return;
    }

    const billableEvents = ['response.done', 'session.updated', 'error'];
    if (!billableEvents.includes(eventType)) return;

    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let totalTokens: number | null = null;
    let modelId: string | null = null;

    if (eventType === 'response.done') {
      // Gemini Live: usageMetadata at top level
      const usageMeta = eventData?.usageMetadata;
      if (usageMeta) {
        inputTokens =
          usageMeta.promptTokenCount || usageMeta.inputTokenCount || null;
        outputTokens =
          usageMeta.responseTokenCount || usageMeta.candidatesTokenCount || usageMeta.outputTokenCount || null;
        totalTokens = usageMeta.totalTokenCount || null;
        if (!totalTokens && inputTokens !== null && outputTokens !== null) {
          totalTokens = inputTokens + outputTokens;
        }
        modelId =
          eventData.modelVersion ||
          sessionOptions.providerOptions?.model ||
          null;
      }

      // OpenAI Realtime: usage inside eventData.response
      if (!inputTokens && eventData?.response?.usage) {
        const u = eventData.response.usage;
        inputTokens =
          u.input_tokens || u.prompt_tokens || u.inputTokens || null;
        outputTokens =
          u.output_tokens || u.completion_tokens || u.outputTokens || null;
        totalTokens = u.total_tokens || u.totalTokens || null;
        if (!totalTokens && inputTokens !== null && outputTokens !== null) {
          totalTokens = inputTokens + outputTokens;
        }
        modelId =
          modelId ||
          eventData.response.model ||
          sessionOptions.providerOptions?.model ||
          null;
      }

      modelId = modelId || sessionOptions.providerOptions?.model || null;
    } else if (eventType === 'session.updated') {
      modelId =
        eventData.session?.model ||
        sessionOptions.providerOptions?.model ||
        null;
    } else if (eventType === 'error') {
      modelId = eventData.model || sessionOptions.providerOptions?.model || null;
    }

    const jobPayload = {
      eventId: randomUUID(),
      runId: sessionId,
      userId,
      clientId,
      sessionId,
      externalSession,
      externalUser,
      provider: provider || 'unknown',
      modelId: modelId || 'unknown',
      outcome: eventType === 'error' ? 'error' : 'success',
      stepName: `realtime:${eventType}`,
      actionType: 'voice_api',
      inputTokens,
      outputTokens,
      totalTokens,
      timestamp: new Date().toISOString(),
      promptContent: null,
      requestBody: conversationSnapshot || {},
      responseBody: eventData,
      metadata: {
        realtimeEvent: true,
        eventType,
        provider,
        modelId,
        sessionOptions: {
          id: sessionOptions.id,
          requestURL: sanitizeUrl(sessionOptions.providerOptions?.requestURL),
        },
      },
    };

    const boss = await getBoss();
    await boss.send('classification', jobPayload);

    console.log('[stringcost-plugin] realtimeEventLogger: job queued', {
      eventId: jobPayload.eventId,
      eventType,
      sessionId,
      inputTokens,
      outputTokens,
    });
  } catch (error) {
    console.error('[stringcost-plugin] realtimeEventLogger failed', error);
  }
}
