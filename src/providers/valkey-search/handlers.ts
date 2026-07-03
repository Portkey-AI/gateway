/**
 * @file src/providers/valkey-search/handlers.ts
 * Request handlers for the valkey-search provider.
 *
 * Each handler maps to a Valkey FT.* or hash command executed natively via
 * @valkey/valkey-glide over the RESP protocol. No HTTP proxying is involved.
 *
 * Endpoint mapping:
 *  POST   /v1/indexes                       -> createIndex   (FT.CREATE)
 *  DELETE /v1/indexes/:name                 -> dropIndex     (FT.DROPINDEX)
 *  GET    /v1/indexes/:name                 -> getIndex      (FT.INFO)
 *  POST   /v1/indexes/:name/upsert          -> upsertDocs    (HSET per document)
 *  POST   /v1/indexes/:name/search          -> searchIndex   (FT.SEARCH with KNN)
 *  POST   /v1/indexes/:name/documents/delete -> deleteDocs   (DEL array of keys)
 */
import {
  GlideClient,
  GlideClusterClient,
  GlideFt,
  Decoder,
  Field,
} from '@valkey/valkey-glide';
import { createHash } from 'crypto';
import {
  createValkeyClient,
  parseValkeyConnectionString,
} from '../../shared/services/valkey/client';
import { RequestHandler } from '../types';

type AnyGlideClient = GlideClient | GlideClusterClient;

// ---------------------------------------------------------------------------
// Client cache - reuse connections keyed by address string
// ---------------------------------------------------------------------------
const MAX_CLIENT_CACHE_SIZE = 50;
const clientCache = new Map<string, Promise<AnyGlideClient>>();

function getClient(customHost: string): Promise<AnyGlideClient> {
  const address = customHost.includes('://')
    ? customHost
    : `valkey://${customHost}`;

  // Hash the address to avoid storing credentials in Map keys (heap dump safety)
  const cacheKey = createHash('sha256').update(address).digest('hex');

  if (clientCache.has(cacheKey)) {
    // Move to end (most recently used)
    const existing = clientCache.get(cacheKey)!;
    clientCache.delete(cacheKey);
    clientCache.set(cacheKey, existing);
    return existing;
  }

  // Evict oldest entry if at capacity
  if (clientCache.size >= MAX_CLIENT_CACHE_SIZE) {
    const oldest = clientCache.keys().next().value!;
    const evicted = clientCache.get(oldest);
    clientCache.delete(oldest);
    evicted?.then((c) => c.close()).catch(() => {});
  }

  const { addresses, options } = parseValkeyConnectionString(address);
  const p = createValkeyClient(addresses, options).catch((err) => {
    clientCache.delete(cacheKey);
    throw err;
  });
  clientCache.set(cacheKey, p);
  return p;
}

// Graceful shutdown: close all cached GLIDE connections
if (typeof process !== 'undefined') {
  const closeAll = async () => {
    for (const [, p] of clientCache) {
      try {
        (await p).close();
      } catch (e) {
        console.warn(
          '[valkey-search] Error closing client during shutdown:',
          e
        );
      }
    }
    clientCache.clear();
  };
  process.once('SIGTERM', closeAll);
  process.once('SIGINT', closeAll);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse(
    { error: { message, type: 'valkey_error', param: null, code: null } },
    status
  );
}

/**
 * Extract the index name from the request URL.
 * URLs follow the pattern /v1/indexes/:name[/...]
 */
function extractIndexName(url: string): string | null {
  const match = url.match(/\/v1\/indexes\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// Allowlist: alphanumeric, underscore, hyphen only; max 128 chars
function validateIndexName(name: string): string | null {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(name)) {
    return 'index name must contain only alphanumeric characters, underscores, and hyphens (max 128 chars)';
  }
  return null;
}

// Allowlist for document IDs: alphanumeric, underscore, colon, dot, hyphen; max 256 chars
function validateDocId(id: string): boolean {
  return typeof id === 'string' && /^[a-zA-Z0-9_:.-]{1,256}$/.test(id);
}

/**
 * Security guard: reject filter strings that could manipulate the query structure.
 * Blocks "=>" (KNN-clause injection) and RediSearch control keywords/syntax
 * that could alter query execution when interpolated into the filter clause.
 */
function validateFilter(filter: unknown): string | null {
  if (filter === undefined || filter === null) return null;
  if (typeof filter !== 'string') return 'filter must be a string';
  if (filter.includes('=>')) {
    return 'filter expression must not contain "=>" (KNN-clause injection risk)';
  }
  // Block unbalanced parens that could break out of the (filter) wrapper
  let depth = 0;
  for (const ch of filter) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth < 0) return 'filter contains unbalanced parentheses';
  }
  if (depth !== 0) return 'filter contains unbalanced parentheses';
  // Block RediSearch query modifiers that should not appear in a filter expression
  const blocked =
    /\b(SORTBY|LIMIT|RETURN|WITHSCORES|DIALECT|PARAMS|SUMMARIZE|HIGHLIGHT)\b/i;
  if (blocked.test(filter)) {
    return 'filter must not contain query modifiers (SORTBY, LIMIT, RETURN, etc.)';
  }
  return null;
}

/**
 * Distinguish "index not found" errors from connection/other errors.
 * GLIDE throws with message containing "Unknown index" for missing indexes.
 */
function isIndexNotFoundError(err: any): boolean {
  const msg = err?.message ?? '';
  return (
    msg.includes('Unknown index') ||
    msg.includes('no such index') ||
    msg.includes('not found')
  );
}

const MAX_BATCH_SIZE = 1000;

/**
 * Shared connection boilerplate: validate customHost, acquire a GLIDE client.
 * Returns the client on success or a pre-built error Response on failure.
 */
async function requireClient(providerOptions: {
  customHost?: string;
}): Promise<AnyGlideClient | Response> {
  const customHost = providerOptions.customHost || '';
  if (!customHost) {
    return errorResponse(
      'customHost is required for valkey-search provider',
      400
    );
  }
  try {
    return await getClient(customHost);
  } catch (err: any) {
    console.error('[valkey-search] Connection failed:', err.message);
    return errorResponse('Service temporarily unavailable', 503);
  }
}

// ---------------------------------------------------------------------------
// Schema conversion helper
// ---------------------------------------------------------------------------
/**
 * Convert the request body's schema object (keyed by field name) into the
 * typed Field[] array required by GlideFt.create.
 *
 * Request format:
 *   { "vector": { "type": "VECTOR", "algorithm": "HNSW", "dims": 1536, "distance": "COSINE" },
 *     "content": { "type": "TEXT" },
 *     "source":  { "type": "TAG" } }
 *
 * The user may pass either the GLIDE key names (dimensions, distanceMetric) or
 * the shorthand aliases used in our API (dims, distance).
 */
function buildFields(schema: Record<string, any>): Field[] | string {
  const ALLOWED_TYPES = new Set(['VECTOR', 'TAG', 'NUMERIC', 'TEXT']);
  const fields: Field[] = [];
  for (const [fieldName, config] of Object.entries(schema)) {
    const type = (config.type as string).toUpperCase();
    if (!ALLOWED_TYPES.has(type)) {
      return `Unsupported field type "${type}" for field "${fieldName}". Allowed: VECTOR, TAG, NUMERIC, TEXT`;
    }
    if (type === 'VECTOR') {
      const algorithm = (config.algorithm ?? 'HNSW') as 'HNSW' | 'FLAT';
      const dimensions = config.dims ?? config.dimensions;
      const distanceMetric = (config.distance ?? config.distanceMetric) as
        | 'L2'
        | 'IP'
        | 'COSINE';
      fields.push({
        type: 'VECTOR' as const,
        name: fieldName,
        attributes: { algorithm, dimensions, distanceMetric },
      });
    } else if (type === 'TAG') {
      fields.push({ type: 'TAG' as const, name: fieldName });
    } else if (type === 'NUMERIC') {
      fields.push({ type: 'NUMERIC' as const, name: fieldName });
    } else {
      fields.push({ type: 'TEXT' as const, name: fieldName });
    }
  }
  return fields;
}

// ---------------------------------------------------------------------------
// POST /v1/indexes  ->  FT.CREATE
// ---------------------------------------------------------------------------
export const createIndexHandler: RequestHandler = async ({
  providerOptions,
  requestBody,
}) => {
  const body = requestBody as any;
  const { name, schema, options: indexOptions } = body;

  if (!name || typeof name !== 'string') {
    return errorResponse('name is required and must be a string');
  }
  const nameError = validateIndexName(name);
  if (nameError) return errorResponse(nameError);
  if (!schema || typeof schema !== 'object') {
    return errorResponse('schema is required and must be an object');
  }

  const clientOrError = await requireClient(providerOptions);
  if (clientOrError instanceof Response) return clientOrError;
  const client = clientOrError;

  // Check if index already exists
  try {
    await GlideFt.info(client, name);
    return errorResponse(`Index "${name}" already exists`, 409);
  } catch (err: any) {
    if (!isIndexNotFoundError(err)) {
      console.error('[valkey-search] FT.INFO failed:', err.message);
      return errorResponse('Service temporarily unavailable', 503);
    }
    // Index does not exist - proceed
  }

  try {
    const fieldsOrError = buildFields(schema);
    if (typeof fieldsOrError === 'string') {
      return errorResponse(fieldsOrError);
    }
    const fields = fieldsOrError;
    const ftOptions = indexOptions
      ? {
          dataType: (indexOptions.dataType ?? 'HASH') as 'HASH' | 'JSON',
          prefixes: indexOptions.prefix
            ? [indexOptions.prefix]
            : indexOptions.prefixes ?? [],
        }
      : undefined;
    await GlideFt.create(client, name, fields, ftOptions);
    return jsonResponse({ object: 'index', name, status: 'created' }, 201);
  } catch (err: any) {
    console.error('[valkey-search] FT.CREATE failed:', err.message);
    return errorResponse('Failed to create index', 500);
  }
};

// ---------------------------------------------------------------------------
// DELETE /v1/indexes/:name  ->  FT.DROPINDEX
// ---------------------------------------------------------------------------
export const dropIndexHandler: RequestHandler = async ({
  providerOptions,
  requestURL,
}) => {
  const name = extractIndexName(requestURL);
  if (!name) return errorResponse('Could not parse index name from URL');
  const nameError = validateIndexName(name);
  if (nameError) return errorResponse(nameError);

  const clientOrError = await requireClient(providerOptions);
  if (clientOrError instanceof Response) return clientOrError;
  const client = clientOrError;

  // Pre-validate: raise if index missing
  try {
    await GlideFt.info(client, name);
  } catch (err: any) {
    if (isIndexNotFoundError(err)) {
      return errorResponse(`Index "${name}" not found`, 404);
    }
    console.error('[valkey-search] FT.INFO failed:', err.message);
    return errorResponse('Service temporarily unavailable', 503);
  }

  try {
    await GlideFt.dropindex(client, name);
    return jsonResponse({ object: 'index', name, deleted: true });
  } catch (err: any) {
    console.error('[valkey-search] FT.DROPINDEX failed:', err.message);
    return errorResponse('Failed to drop index', 500);
  }
};

// ---------------------------------------------------------------------------
// GET /v1/indexes/:name  ->  FT.INFO
// ---------------------------------------------------------------------------
export const getIndexHandler: RequestHandler = async ({
  providerOptions,
  requestURL,
}) => {
  const name = extractIndexName(requestURL);
  if (!name) return errorResponse('Could not parse index name from URL');
  const nameError = validateIndexName(name);
  if (nameError) return errorResponse(nameError);

  const clientOrError = await requireClient(providerOptions);
  if (clientOrError instanceof Response) return clientOrError;
  const client = clientOrError;

  try {
    const info = await GlideFt.info(client, name);
    return jsonResponse({ object: 'index', name, info });
  } catch (err: any) {
    if (isIndexNotFoundError(err)) {
      return errorResponse(`Index "${name}" not found`, 404);
    }
    console.error('[valkey-search] FT.INFO failed:', err.message);
    return errorResponse('Service temporarily unavailable', 503);
  }
};

// ---------------------------------------------------------------------------
// POST /v1/indexes/:name/upsert  ->  HSET per document
// ---------------------------------------------------------------------------
export const upsertDocsHandler: RequestHandler = async ({
  providerOptions,
  requestURL,
  requestBody,
}) => {
  const indexName = extractIndexName(requestURL);
  if (!indexName) return errorResponse('Could not parse index name from URL');
  const nameError = validateIndexName(indexName);
  if (nameError) return errorResponse(nameError);

  const body = requestBody as any;
  const documents: Array<{
    id: string;
    fields: Record<string, any>;
    vector?: number[];
  }> = body?.documents;

  if (!Array.isArray(documents) || documents.length === 0) {
    return errorResponse('documents must be a non-empty array');
  }
  if (documents.length > MAX_BATCH_SIZE) {
    return errorResponse(
      `documents array exceeds maximum batch size of ${MAX_BATCH_SIZE}`
    );
  }

  const clientOrError = await requireClient(providerOptions);
  if (clientOrError instanceof Response) return clientOrError;
  const client = clientOrError;

  const results: Array<{ id: string; status: string; error?: string }> = [];

  for (const doc of documents) {
    if (!doc.id || typeof doc.id !== 'string') {
      results.push({
        id: String(doc.id ?? ''),
        status: 'error',
        error: 'id must be a non-empty string',
      });
      continue;
    }
    if (!validateDocId(doc.id)) {
      results.push({
        id: String(doc.id),
        status: 'error',
        error:
          'id contains invalid characters (allowed: alphanumeric, _ : . -)',
      });
      continue;
    }

    const key = `${indexName}:${doc.id}`;
    const fieldMap: Record<string, any> = { ...(doc.fields || {}) };

    // Serialize vector as raw Float32 bytes - NEVER call .toString() on the buffer
    if (Array.isArray(doc.vector)) {
      const float32 = new Float32Array(doc.vector);
      fieldMap['vector'] = Buffer.from(float32.buffer);
    }

    try {
      await client.hset(key, fieldMap);
      results.push({ id: doc.id, status: 'upserted' });
    } catch (err: any) {
      results.push({
        id: doc.id,
        status: 'error',
        error: `write failed: ${(err.message ?? '').slice(0, 200)}`,
      });
    }
  }

  const hasErrors = results.some((r) => r.status === 'error');
  return jsonResponse({ object: 'list', data: results }, hasErrors ? 207 : 200);
};

// ---------------------------------------------------------------------------
// POST /v1/indexes/:name/search  ->  FT.SEARCH with KNN query
// ---------------------------------------------------------------------------
export const searchIndexHandler: RequestHandler = async ({
  providerOptions,
  requestURL,
  requestBody,
}) => {
  const indexName = extractIndexName(requestURL);
  if (!indexName) return errorResponse('Could not parse index name from URL');
  const nameError = validateIndexName(indexName);
  if (nameError) return errorResponse(nameError);

  const body = requestBody as any;
  const { vector, top_k = 10, filter, return_fields } = body;

  if (!Array.isArray(vector) || vector.length === 0) {
    return errorResponse('vector must be a non-empty array of numbers');
  }

  const k =
    typeof top_k === 'number' &&
    Number.isInteger(top_k) &&
    top_k >= 1 &&
    top_k <= 10000
      ? top_k
      : null;
  if (k === null)
    return errorResponse('top_k must be an integer between 1 and 10000');

  const filterError = validateFilter(filter);
  if (filterError) return errorResponse(filterError);

  const clientOrError = await requireClient(providerOptions);
  if (clientOrError instanceof Response) return clientOrError;
  const client = clientOrError;

  // Pre-validate index exists
  try {
    await GlideFt.info(client, indexName);
  } catch (err: any) {
    if (isIndexNotFoundError(err)) {
      return errorResponse(`Index "${indexName}" not found`, 404);
    }
    console.error('[valkey-search] FT.INFO failed:', err.message);
    return errorResponse('Service temporarily unavailable', 503);
  }

  // Build KNN query: (filter)=>[KNN k @vector $BLOB AS __score]
  const filterClause = filter ? `(${filter})` : '*';
  const query = `${filterClause}=>[KNN ${k} @vector $BLOB AS __score]`;

  // Encode vector as Float32 bytes
  const float32 = new Float32Array(vector);
  const vectorBytes = Buffer.from(float32.buffer);

  const searchParams: any = {
    params: [{ key: 'BLOB', value: vectorBytes }],
    decoder: Decoder.Bytes,
  };

  if (Array.isArray(return_fields) && return_fields.length > 0) {
    searchParams.returnFields = return_fields.map((f: string) => ({
      fieldIdentifier: f,
    }));
  }

  try {
    const results = await GlideFt.search(
      client,
      indexName,
      query,
      searchParams
    );
    // results: [number, GlideRecord<GlideRecord<GlideString>>]
    // GlideRecord is {key, value}[] — transform to consumer-friendly objects.
    // With Decoder.Bytes, values are Buffer objects. Decode to UTF-8 where
    // valid; skip fields that contain raw binary (e.g. vector embeddings).
    const [totalCount, records] = results;
    const hits = (records as any[]).map(({ key: docId, value: fields }) => {
      const doc: Record<string, string> = {};
      for (const { key: fieldName, value: fieldValue } of fields) {
        const name = Buffer.isBuffer(fieldName)
          ? fieldName.toString('utf8')
          : String(fieldName);
        // Skip binary vector fields — they cannot be meaningfully serialized as JSON strings
        if (Buffer.isBuffer(fieldValue)) {
          const str = fieldValue.toString('utf8');
          // If decoding produces replacement chars, it's likely binary — omit
          if (!str.includes('\ufffd') && fieldValue.length < 10000) {
            doc[name] = str;
          }
        } else {
          doc[name] = String(fieldValue);
        }
      }
      return {
        id: Buffer.isBuffer(docId) ? docId.toString('utf8') : String(docId),
        fields: doc,
      };
    });
    return jsonResponse({ object: 'list', total: totalCount, data: hits });
  } catch (err: any) {
    console.error('[valkey-search] FT.SEARCH failed:', err.message);
    return errorResponse('Search failed', 500);
  }
};

// ---------------------------------------------------------------------------
// POST /v1/indexes/:name/documents/delete  ->  DEL array of keys
// ---------------------------------------------------------------------------
export const deleteDocsHandler: RequestHandler = async ({
  providerOptions,
  requestURL,
  requestBody,
}) => {
  const indexName = extractIndexName(requestURL);
  if (!indexName) return errorResponse('Could not parse index name from URL');
  const nameError = validateIndexName(indexName);
  if (nameError) return errorResponse(nameError);

  const body = requestBody as any;
  const ids: string[] = body?.ids;

  if (!Array.isArray(ids) || ids.length === 0) {
    return errorResponse('ids must be a non-empty array of strings');
  }
  if (ids.length > MAX_BATCH_SIZE) {
    return errorResponse(
      `ids array exceeds maximum batch size of ${MAX_BATCH_SIZE}`
    );
  }

  const invalidId = ids.find((id) => !validateDocId(id));
  if (invalidId !== undefined) {
    return errorResponse(
      `Invalid document id: "${String(invalidId).slice(0, 64)}"`
    );
  }

  const clientOrError = await requireClient(providerOptions);
  if (clientOrError instanceof Response) return clientOrError;
  const client = clientOrError;

  const keys = ids.map((id) => `${indexName}:${id}`);

  try {
    // GLIDE del() takes an array, not variadic args
    const deleted = await client.del(keys);
    return jsonResponse({ object: 'delete', deleted });
  } catch (err: any) {
    console.error('[valkey-search] DEL failed:', err.message);
    return errorResponse('Delete failed', 500);
  }
};
