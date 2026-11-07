// SPDX-License-Identifier: MIT
import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';
import { getCurrentContentPart } from '../utils';
import { computeKvPrefixHash64, SiliciumCredentials } from './piiGuardrail';

const MAX_TENANT_SCOPES = 256;
const MAX_ENTRIES_PER_TENANT = 1024;
const DEFAULT_CACHE_DIM = 8;

interface TenantCacheEntry {
  vector: Float32Array;
  response: unknown;
  kvPrefixHash: string;
}

const tenantStores = new Map<string, TenantCacheEntry[]>();

export function deriveDeterministicEmbedding(
  text: string,
  dim: number = DEFAULT_CACHE_DIM
): Float32Array {
  const vec = new Float32Array(dim);
  let state = 0x811c9dc5;
  let norm = 0.0;
  for (let i = 0; i < text.length; i++) {
    state ^= text.charCodeAt(i) & 0xff;
    state = Math.imul(state, 0x01000193) >>> 0;
    const slot = i % dim;
    const centered = ((state & 0xffff) - 32768.0) / 32768.0;
    vec[slot] += centered;
  }
  for (let j = 0; j < dim; j++) {
    norm += vec[j] * vec[j];
  }
  const scale = norm > 1e-12 ? 1.0 / Math.sqrt(norm) : 1.0;
  for (let j = 0; j < dim; j++) {
    vec[j] *= scale;
  }
  return vec;
}

function l2DistanceSquared(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length);
  let sum = 0.0;
  for (let i = 0; i < len; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return sum;
}

function getOrCreateTenantEntries(scope: string): TenantCacheEntry[] {
  let entries = tenantStores.get(scope);
  if (!entries) {
    if (tenantStores.size >= MAX_TENANT_SCOPES) {
      const oldestKey = tenantStores.keys().next().value;
      if (oldestKey !== undefined) {
        tenantStores.delete(oldestKey);
      }
    }
    entries = [];
    tenantStores.set(scope, entries);
  }
  return entries;
}

export function resetSemanticCacheForTests(): void {
  tenantStores.clear();
}

export function seedSemanticCache(
  embeddingOrText: number[] | Float32Array | string,
  responsePayload: unknown,
  tenantScope: string = 'default-tenant',
  cacheDim: number = DEFAULT_CACHE_DIM
): void {
  const entries = getOrCreateTenantEntries(tenantScope);
  const vector =
    typeof embeddingOrText === 'string'
      ? deriveDeterministicEmbedding(embeddingOrText, cacheDim)
      : Float32Array.from(embeddingOrText);
  const { kvPrefixHash } = computeKvPrefixHash64(
    typeof embeddingOrText === 'string'
      ? embeddingOrText
      : JSON.stringify(Array.from(vector))
  );
  if (entries.length >= MAX_ENTRIES_PER_TENANT) {
    entries.shift();
  }
  entries.push({
    vector,
    response: responsePayload,
    kvPrefixHash,
  });
}

export const handler: PluginHandler<SiliciumCredentials> = async (
  context: PluginContext,
  parameters: PluginParameters<SiliciumCredentials>,
  eventType: HookEventType,
  options
) => {
  const transformedData: Record<string, unknown> = {
    request: {
      json: null,
    },
    response: {
      json: null,
    },
  };

  const effectiveContext: PluginContext = context.requestType
    ? context
    : { ...context, requestType: 'chatComplete' };

  const target = eventType === 'beforeRequestHook' ? 'request' : 'response';
  if (!effectiveContext[target]?.json) {
    return {
      error: { message: 'request or response json is empty' },
      verdict: true,
      data: null,
      transformedData,
      transformed: false,
    };
  }

  const { content, textArray } = getCurrentContentPart(
    effectiveContext,
    eventType
  );
  if (!content) {
    return {
      error: { message: 'request or response content is empty' },
      verdict: true,
      data: null,
      transformedData,
      transformed: false,
    };
  }

  const combinedText = textArray.filter(Boolean).join('\n');
  const tenantScope =
    (typeof parameters.tenantScope === 'string'
      ? parameters.tenantScope
      : undefined) ||
    parameters.credentials?.tenantScope ||
    'default-tenant';
  const distanceThreshold =
    typeof parameters.distanceThreshold === 'number'
      ? parameters.distanceThreshold
      : 0.2;
  const cacheDim =
    typeof parameters.cacheDim === 'number' && parameters.cacheDim > 0
      ? parameters.cacheDim
      : DEFAULT_CACHE_DIM;

  const rawEmbedding = parameters.embedding;
  const queryVec = Array.isArray(rawEmbedding)
    ? Float32Array.from(rawEmbedding)
    : deriveDeterministicEmbedding(combinedText, cacheDim);

  const { kvPrefixHash, workerId } = computeKvPrefixHash64(combinedText);
  const entries = getOrCreateTenantEntries(tenantScope);

  if (parameters.seedResponse !== undefined) {
    seedSemanticCache(
      queryVec,
      parameters.seedResponse,
      tenantScope,
      queryVec.length
    );
  } else if (
    eventType === 'afterRequestHook' &&
    effectiveContext.response?.json
  ) {
    seedSemanticCache(
      queryVec,
      effectiveContext.response.json,
      tenantScope,
      queryVec.length
    );
    if (options?.putInCacheWithValue) {
      await options.putInCacheWithValue(
        `${tenantScope}:${kvPrefixHash}`,
        effectiveContext.response.json
      );
    }
  }

  let cacheHit = false;
  let cachedResponse: unknown = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const entry of entries) {
    if (entry.vector.length === queryVec.length) {
      const dist = l2DistanceSquared(queryVec, entry.vector);
      if (dist <= distanceThreshold && dist < bestDistance) {
        bestDistance = dist;
        cacheHit = true;
        cachedResponse = entry.response;
      }
    }
  }

  if (!cacheHit && options?.getFromCacheByKey) {
    const extCached = await options.getFromCacheByKey(
      `${tenantScope}:${kvPrefixHash}`
    );
    if (extCached !== undefined && extCached !== null) {
      cacheHit = true;
      cachedResponse = extCached;
      bestDistance = 0.0;
    }
  }

  return {
    error: null,
    verdict: true,
    data: {
      cacheHit,
      tenantScope,
      kvPrefixHash,
      workerId,
      distance: Number.isFinite(bestDistance) ? bestDistance : null,
      cachedResponse,
      eventType,
    },
    transformedData,
    transformed: false,
  };
};
