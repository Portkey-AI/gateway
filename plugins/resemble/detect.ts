import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { post, HttpError } from '../utils';

export const RESEMBLE_DEFAULT_BASE_URL = 'https://app.resemble.ai/api/v2';

// Matches HTTPS URLs ending in common audio/video/image extensions. Query
// strings and fragments are allowed. Kept intentionally simple — multimodal
// content parts and metadata lookups handle the non-URL-in-text cases.
const MEDIA_URL_REGEX =
  /https?:\/\/[^\s<>"')\]}]+?\.(?:mp3|wav|m4a|flac|ogg|opus|aac|webm|mp4|mov|avi|mkv|jpg|jpeg|png|webp|gif)(?:\?[^\s<>"')\]}]*)?/gi;

interface ResembleCredentials {
  apiKey: string;
  apiBase?: string;
}

interface ResembleDetectParameters {
  credentials?: ResembleCredentials;
  threshold?: number;
  mediaType?: 'audio' | 'video' | 'image';
  audioSourceTracing?: boolean;
  useReverseSearch?: boolean;
  zeroRetentionMode?: boolean;
  urlSource?: 'auto' | 'metadata' | 'content';
  metadataKey?: string;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  failClosed?: boolean;
  timeout?: number; // per-HTTP-call timeout
}

interface DetectCreateResponse {
  success: boolean;
  item: {
    uuid: string;
    status: 'processing' | 'completed' | 'failed';
  };
}

interface DetectResultResponse {
  success: boolean;
  item: {
    uuid: string;
    media_type?: 'audio' | 'video' | 'image';
    status: 'processing' | 'completed' | 'failed';
    metrics?: {
      label: string;
      score: string[];
      aggregated_score: string;
      consistency?: string;
    } | null;
    image_metrics?: {
      label: string;
      score: number;
      type?: string;
    } | null;
    video_metrics?: {
      label: string;
      score: number;
      certainty?: number;
    } | null;
    audio_source_tracing?: {
      label?: string;
      error_message?: string | null;
    } | null;
    error_message?: string | null;
  };
}

/**
 * Extracts a single media URL from the request context. Inspects (in order,
 * depending on urlSource):
 *   1. Multimodal content parts (input_audio, image_url, video_url)
 *   2. Text regex for audio/video/image extensions
 *   3. context.metadata[metadataKey]
 */
export function extractMediaUrl(
  context: PluginContext,
  eventType: HookEventType,
  urlSource: 'auto' | 'metadata' | 'content',
  metadataKey: string
): string | null {
  const metadataCandidate = context.metadata?.[metadataKey];
  if (urlSource === 'metadata') {
    return typeof metadataCandidate === 'string' ? metadataCandidate : null;
  }

  const target = eventType === 'beforeRequestHook' ? 'request' : 'response';
  const json = context[target]?.json;

  // 1) Multimodal content parts — chat completion style
  if (json?.messages && Array.isArray(json.messages)) {
    for (let i = json.messages.length - 1; i >= 0; i--) {
      const message = json.messages[i];
      if (!message || !Array.isArray(message.content)) continue;
      for (const part of message.content) {
        if (!part || typeof part !== 'object') continue;
        // OpenAI-style input_audio part
        if (part.type === 'input_audio' && part.input_audio?.url) {
          return part.input_audio.url;
        }
        // OpenAI-style image_url part
        if (part.type === 'image_url' && part.image_url?.url) {
          return part.image_url.url;
        }
        // Anthropic-style source.url (image or document)
        if (
          (part.type === 'image' || part.type === 'document') &&
          part.source?.type === 'url' &&
          part.source?.url
        ) {
          return part.source.url;
        }
      }
    }
  }

  // 2) Regex over joined text
  const textChunks: string[] = [];
  if (json?.messages && Array.isArray(json.messages)) {
    for (const message of json.messages) {
      if (typeof message.content === 'string') {
        textChunks.push(message.content);
      } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part?.type === 'text' && typeof part.text === 'string') {
            textChunks.push(part.text);
          }
        }
      }
    }
  }
  if (typeof json?.prompt === 'string') textChunks.push(json.prompt);
  if (typeof json?.input === 'string') textChunks.push(json.input);

  const joined = textChunks.join('\n');
  const match = joined.match(MEDIA_URL_REGEX);
  if (match && match.length > 0) {
    return match[0];
  }

  // 3) Metadata fallback (only when urlSource === 'auto')
  if (urlSource === 'auto' && typeof metadataCandidate === 'string') {
    return metadataCandidate;
  }

  return null;
}

/**
 * Polls GET /detect/{uuid} until status is completed/failed or timeout hits.
 */
export async function pollDetectResult(
  uuid: string,
  credentials: ResembleCredentials,
  pollIntervalMs: number,
  pollTimeoutMs: number,
  httpTimeoutMs: number,
  fetchJson: (url: string, init: RequestInit) => Promise<any> = defaultFetchJson
): Promise<DetectResultResponse['item']> {
  const baseUrl = credentials.apiBase || RESEMBLE_DEFAULT_BASE_URL;
  const url = `${baseUrl}/detect/${uuid}`;
  const deadline = Date.now() + pollTimeoutMs;

  while (Date.now() < deadline) {
    const result = (await fetchJson(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${credentials.apiKey}`,
        'Content-Type': 'application/json',
      },
      // @ts-expect-error AbortController merged below
      __timeoutMs: httpTimeoutMs,
    })) as DetectResultResponse;

    const item = result?.item;
    if (!item) {
      throw new Error(`Resemble GET /detect/${uuid} returned no item`);
    }
    if (item.status === 'completed' || item.status === 'failed') {
      return item;
    }
    await sleep(pollIntervalMs);
  }

  throw new Error(
    `Resemble detection timed out after ${pollTimeoutMs}ms (uuid=${uuid})`
  );
}

async function defaultFetchJson(url: string, init: RequestInit): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { __timeoutMs, ...rest } = init as any;
  const controller = new AbortController();
  const id =
    typeof __timeoutMs === 'number'
      ? setTimeout(() => controller.abort(), __timeoutMs)
      : null;
  try {
    const response = await fetch(url, { ...rest, signal: controller.signal });
    if (!response.ok) {
      const body = await safeText(response);
      throw new HttpError(`HTTP error! status: ${response.status}`, {
        status: response.status,
        statusText: response.statusText,
        body,
        headers: response.headers,
      });
    }
    return await response.json();
  } finally {
    if (id) clearTimeout(id);
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Evaluates a completed detect item against the configured threshold and
 * returns a pass/fail decision plus a human-readable summary for `data`.
 */
export function evaluateDetection(
  item: DetectResultResponse['item'],
  threshold: number
): { verdict: boolean; label: string; score: number; reason: string } {
  let label = 'unknown';
  let score = 0;

  if (item.metrics) {
    label = (item.metrics.label || '').toLowerCase();
    score = Number(item.metrics.aggregated_score || '0');
  } else if (item.image_metrics) {
    label = (item.image_metrics.label || '').toLowerCase();
    score = Number(item.image_metrics.score || 0);
  } else if (item.video_metrics) {
    label = (item.video_metrics.label || '').toLowerCase();
    score = Number(item.video_metrics.score || 0);
  }

  const isFake = label === 'fake' || score >= threshold;
  const reason = isFake
    ? `Resemble Detect flagged media as ${label} (score=${score}, threshold=${threshold})`
    : `Resemble Detect passed: label=${label}, score=${score}`;

  return { verdict: !isFake, label, score, reason };
}

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  const typed = parameters as unknown as ResembleDetectParameters;
  const credentials = typed.credentials;
  const failClosed = typed.failClosed ?? false;

  // Helper that respects failClosed for errors
  const errorOutcome = (
    error: any,
    dataNote: Record<string, any> | null = null
  ) => ({
    error,
    verdict: failClosed ? false : true,
    data: dataNote,
  });

  if (!credentials?.apiKey) {
    return errorOutcome(
      new Error("'parameters.credentials.apiKey' must be set"),
      { reason: 'missing_credentials' }
    );
  }

  const threshold = typed.threshold ?? 0.5;
  const urlSource = typed.urlSource ?? 'auto';
  const metadataKey = typed.metadataKey ?? 'mediaUrl';
  const pollIntervalMs = typed.pollIntervalMs ?? 2000;
  const pollTimeoutMs = typed.pollTimeoutMs ?? 60000;
  const httpTimeoutMs = typed.timeout ?? 10000;

  const mediaUrl = extractMediaUrl(context, eventType, urlSource, metadataKey);
  if (!mediaUrl) {
    // No media referenced — nothing to check. Pass through with data note.
    return {
      error: null,
      verdict: true,
      data: { reason: 'no_media_url_found', urlSource, metadataKey },
    };
  }

  const baseUrl = credentials.apiBase || RESEMBLE_DEFAULT_BASE_URL;
  const createUrl = `${baseUrl}/detect`;
  const createBody: Record<string, any> = { url: mediaUrl };
  if (typed.mediaType) createBody.media_type = typed.mediaType;
  if (typed.audioSourceTracing) createBody.audio_source_tracing = true;
  if (typed.useReverseSearch) createBody.use_reverse_search = true;
  if (typed.zeroRetentionMode) createBody.zero_retention_mode = true;

  try {
    const createResponse = (await post(
      createUrl,
      createBody,
      {
        headers: {
          Authorization: `Bearer ${credentials.apiKey}`,
        },
      },
      httpTimeoutMs
    )) as DetectCreateResponse;

    const uuid = createResponse?.item?.uuid;
    if (!uuid) {
      return errorOutcome(
        new Error(
          'Resemble /detect response is missing item.uuid — cannot poll'
        ),
        { reason: 'missing_uuid', createResponse }
      );
    }

    // If already completed synchronously, skip polling
    const initialStatus = createResponse.item.status;
    let finalItem: DetectResultResponse['item'];
    if (initialStatus === 'completed' && (createResponse.item as any).metrics) {
      finalItem = createResponse.item as DetectResultResponse['item'];
    } else {
      finalItem = await pollDetectResult(
        uuid,
        credentials,
        pollIntervalMs,
        pollTimeoutMs,
        httpTimeoutMs
      );
    }

    if (finalItem.status === 'failed') {
      return errorOutcome(
        new Error(
          `Resemble detection failed: ${finalItem.error_message || 'unknown reason'}`
        ),
        { reason: 'detection_failed', item: finalItem }
      );
    }

    const evaluation = evaluateDetection(finalItem, threshold);
    return {
      error: null,
      verdict: evaluation.verdict,
      data: {
        uuid: finalItem.uuid,
        mediaUrl,
        mediaType: finalItem.media_type,
        label: evaluation.label,
        score: evaluation.score,
        threshold,
        reason: evaluation.reason,
        audioSourceTracing: finalItem.audio_source_tracing ?? null,
      },
    };
  } catch (e: any) {
    if (e instanceof HttpError) {
      const errMessage = `${e.message}. body: ${e.response.body}`;
      return errorOutcome(new Error(errMessage), {
        reason: 'http_error',
        status: e.response.status,
      });
    }
    if (e && typeof e === 'object' && 'stack' in e) delete (e as any).stack;
    return errorOutcome(e, { reason: 'exception' });
  }
};
