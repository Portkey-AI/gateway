/**
 * Realtime Event Logger for WebSocket Voice APIs
 * 
 * Handles cost tracking for WebSocket connections (OpenAI Realtime, Google Gemini Live, Anthropic Voice)
 * Called by RealtimeLlmEventParser when WebSocket events occur
 */

import { randomUUID } from 'node:crypto';

/**
 * Sanitize URL by removing sensitive query parameters (API keys, tokens, etc.)
 * @param url - URL to sanitize
 * @returns Sanitized URL with sensitive params redacted
 */
function sanitizeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  
  try {
    const urlObj = new URL(url);
    const sensitiveParams = ['key', 'apikey', 'api_key', 'token', 'access_token', 'auth'];
    
    // Remove sensitive query parameters
    for (const param of sensitiveParams) {
      if (urlObj.searchParams.has(param)) {
        urlObj.searchParams.set(param, '***');
      }
    }
    
    return urlObj.toString();
  } catch (error) {
    // If URL parsing fails, return a safe fallback
    return '[invalid-url]';
  }
}

// Global singleton for pg-boss
const globalState = globalThis as any;

async function getBoss(): Promise<any> {
  if (globalState._stringcostBossPromise) {
    return globalState._stringcostBossPromise;
  }
  
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL must be configured for job queue');
  }
  
  // Dynamically import PgBoss to avoid bundling issues
  const { PgBoss } = await import('pg-boss');
  // disableMigration: true because pgboss schema is now created by knex migrations
  const boss = new PgBoss({ connectionString, noMigration: true } as any);
  
  globalState._stringcostBossPromise = boss.start()
    .then(async () => {
      console.log('[realtimeEventLogger] pg-boss started');
      await boss.createQueue('classification', { retryLimit: 5 });
      return boss;
    })
    .catch((error) => {
      console.error('[realtimeEventLogger] Failed to start pg-boss:', error?.message);
      throw error;
    });
  
  return globalState._stringcostBossPromise;
}

export async function realtimeEventLogger(
  sessionOptions: any,
  conversationSnapshot: any,
  eventData: any,
  eventType: string
): Promise<void> {
  try {
    const metadata = sessionOptions.requestHeaders || {};
    const sessionId = metadata['x-stringcost-session-id'];
    const userId = metadata['x-stringcost-user-id'];
    const clientId = metadata['x-stringcost-client-id'];
    const provider = metadata['x-stringcost-provider'];
    const externalSession = metadata['x-stringcost-external-session'];
    const externalUser = metadata['x-stringcost-external-user'];

    if (!sessionId || !userId || !clientId) {
      console.warn('[realtimeEventLogger] missing required metadata', {
        hasSessionId: Boolean(sessionId),
        hasUserId: Boolean(userId),
        hasClientId: Boolean(clientId),
      });
      return;
    }

    // Only log events that have cost implications
    const billableEvents = ['response.done', 'session.updated', 'error'];
    if (!billableEvents.includes(eventType)) {
      return;
    }

    console.log('[realtimeEventLogger] processing event', {
      eventType,
      sessionId,
      provider,
    });

    // Extract usage data from event
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let totalTokens: number | null = null;
    let modelId: string | null = null;

    if (eventType === 'response.done') {
      // Google Gemini Live sends usageMetadata at the top level (no eventData.response wrapper)
      const usageMeta = eventData.usageMetadata;
      if (usageMeta) {
        inputTokens = usageMeta.promptTokenCount || usageMeta.inputTokenCount || null;
        outputTokens = usageMeta.responseTokenCount || usageMeta.candidatesTokenCount || usageMeta.outputTokenCount || null;
        totalTokens = usageMeta.totalTokenCount || null;
        if (!totalTokens && inputTokens !== null && outputTokens !== null) {
          totalTokens = inputTokens + outputTokens;
        }
        modelId = eventData.modelVersion || sessionOptions.providerOptions?.model || null;
      }

      // OpenAI Realtime and other providers wrap usage inside eventData.response
      if (!inputTokens && eventData.response) {
        const response = eventData.response;

        if (response.usage) {
          inputTokens = response.usage.input_tokens ||
                        response.usage.prompt_tokens ||
                        response.usage.inputTokens ||
                        null;

          outputTokens = response.usage.output_tokens ||
                         response.usage.completion_tokens ||
                         response.usage.outputTokens ||
                         null;

          totalTokens = response.usage.total_tokens ||
                        response.usage.totalTokens ||
                        null;

          if (!totalTokens && inputTokens !== null && outputTokens !== null) {
            totalTokens = inputTokens + outputTokens;
          }
        }

        modelId = modelId || response.model || response.modelId || sessionOptions.providerOptions?.model || null;
      }

      if (!modelId) {
        modelId = sessionOptions.providerOptions?.model || null;
      }
    } else if (eventType === 'session.updated' && eventData.session) {
      // Session updates may contain model info
      modelId = eventData.session.model || 
                eventData.session.modelId || 
                sessionOptions.providerOptions?.model || 
                null;
    } else if (eventType === 'error') {
      // Extract model from error context if available
      modelId = eventData.model || 
                sessionOptions.providerOptions?.model || 
                null;
    }

    // Build job payload for worker
    const eventId = randomUUID();
    const runId = sessionId;
    const timestamp = new Date().toISOString();

    const jobPayload = {
      eventId,
      runId,
      userId,
      clientId,
      sessionId,
      externalSession: externalSession || null,
      externalUser: externalUser || null,
      provider: provider || 'unknown',
      modelId: modelId || 'unknown',
      outcome: eventType === 'error' ? 'error' : 'success',
      stepName: `realtime:${eventType}`,
      actionType: 'voice_api',
      inputTokens,
      outputTokens,
      totalTokens,
      timestamp,
      promptContent: null, // Voice APIs don't have text prompts
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

    // Queue for async processing
    const boss = await getBoss();
    await boss.send('classification', jobPayload);

    console.log('[realtimeEventLogger] job queued', {
      eventId,
      eventType,
      sessionId,
      inputTokens,
      outputTokens,
      totalTokens,
    });
  } catch (error) {
    console.error('[realtimeEventLogger] failed', error);
    // Don't throw - fail gracefully to avoid disrupting WebSocket connection
  }
}
