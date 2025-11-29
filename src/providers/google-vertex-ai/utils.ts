import {
  GoogleErrorResponse,
  GoogleResponseCandidate,
  GoogleBatchRecord,
  GoogleFinetuneRecord,
  GoogleSearchRetrievalTool,
} from './types';
import { generateErrorResponse } from '../utils';
import {
  BatchEndpoints,
  GOOGLE_VERTEX_AI,
  fileExtensionMimeTypeMap,
} from '../../globals';
import { ErrorResponse, FinetuneRequest, Logprobs } from '../types';
import { Context } from 'hono';
import { env } from 'hono/adapter';
import { ContentType, JsonSchema, Tool } from '../../types/requestBody';
import { GoogleMessagePart } from '../google/chatComplete';

/**
 * Encodes an object as a Base64 URL-encoded string.
 * @param obj The object to encode.
 * @returns The Base64 URL-encoded string.
 */
function base64UrlEncode(obj: Record<string, any>): string {
  return btoa(JSON.stringify(obj))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

const createJWT = async (
  header: Record<string, any>,
  payload: Record<string, any>,
  privateKey: CryptoKey
): Promise<string> => {
  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(payload);

  const data = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);

  const signature = await crypto.subtle.sign(
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: { name: 'SHA-256' },
    },
    privateKey,
    data
  );

  const encodedSignature = btoa(
    String.fromCharCode(...new Uint8Array(signature))
  )
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
};

/**
 * Imports a PEM-formatted private key into a CryptoKey object.
 * @param pem The PEM-formatted private key.
 * @returns The imported private key.
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');

  const binaryDerString = atob(pemContents);
  const binaryDer = new Uint8Array(binaryDerString.length);

  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }

  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer.buffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: { name: 'SHA-256' },
    },
    false,
    ['sign']
  );
}

export const getAccessToken = async (
  c: Context,
  serviceAccountInfo: Record<string, any>
): Promise<string> => {
  try {
    let cacheKey = `${serviceAccountInfo.project_id}/${serviceAccountInfo.private_key_id}/${serviceAccountInfo.client_email}`;
    // try to get from cache
    try {
      const getFromCacheByKey = c.get('getFromCacheByKey');
      const resp = getFromCacheByKey
        ? await getFromCacheByKey(env(c), cacheKey)
        : null;
      if (resp) {
        return resp;
      }
    } catch (err) {}

    const scope = 'https://www.googleapis.com/auth/cloud-platform';
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 3600; // Token expiration time (1 hour)

    const payload = {
      iss: serviceAccountInfo.client_email,
      sub: serviceAccountInfo.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      iat: iat,
      exp: exp,
      scope: scope,
    };

    const header = {
      alg: 'RS256',
      typ: 'JWT',
      kid: serviceAccountInfo.private_key_id,
    };

    const privateKey = await importPrivateKey(serviceAccountInfo.private_key);

    const jwtToken = await createJWT(header, payload, privateKey);

    const tokenUrl = 'https://oauth2.googleapis.com/token';
    const tokenHeaders = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    const tokenData = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwtToken,
    });

    const tokenResponse = await fetch(tokenUrl, {
      headers: tokenHeaders,
      body: tokenData,
      method: 'POST',
    });

    const tokenJson: Record<string, any> = await tokenResponse.json();
    const putInCacheWithValue = c.get('putInCacheWithValue');
    if (putInCacheWithValue && cacheKey) {
      await putInCacheWithValue(env(c), cacheKey, tokenJson.access_token, 3000); // 50 minutes
    }

    return tokenJson.access_token;
  } catch (err) {
    return '';
  }
};

export const getModelAndProvider = (modelString: string) => {
  let provider = 'google';
  let model = modelString;
  const modelStringParts = modelString.split('.');
  if (
    modelStringParts.length > 1 &&
    ['google', 'anthropic', 'meta', 'endpoints', 'mistralai'].includes(
      modelStringParts[0]
    )
  ) {
    provider = modelStringParts[0];
    model = modelStringParts.slice(1).join('.');
  }

  return { provider, model };
};

export const getMimeType = (url: string): string | undefined => {
  const urlParts = url.split('.');
  const extension = urlParts[
    urlParts.length - 1
  ] as keyof typeof fileExtensionMimeTypeMap;
  return fileExtensionMimeTypeMap[extension];
};

export const GoogleErrorResponseTransform: (
  response: GoogleErrorResponse,
  provider?: string
) => ErrorResponse | undefined = (response, provider = GOOGLE_VERTEX_AI) => {
  if ('error' in response) {
    return generateErrorResponse(
      {
        message: response.error.message ?? '',
        type: response.error.status ?? null,
        param: null,
        code: response.error.status ?? null,
      },
      provider
    );
  }

  return undefined;
};

// Extract definition key from a JSON Schema $ref string
const getDefFromRef = (ref: string): string | null => {
  const match = ref.match(/^#\/\$defs\/(.+)$/);
  return match ? match[1] : null;
};

const getDefObject = (
  defs: Record<string, any> | undefined | null,
  key: string | null
): any => (key && defs ? defs[key] : undefined);

// Recursively expands $ref nodes in a JSON Schema object tree
export const derefer = (
  schema: any,
  defs: Record<string, any> | null = null,
  stack: Set<string> = new Set()
): any => {
  if (schema === null || typeof schema !== 'object') return schema;
  if (Array.isArray(schema))
    return schema.map((item) => derefer(item, defs, stack));
  const node = { ...schema };
  const activeDefs =
    defs ?? (node.$defs as Record<string, any> | undefined) ?? null;
  if ('$ref' in node && typeof node.$ref === 'string') {
    const defKey = getDefFromRef(node.$ref);
    const target = getDefObject(activeDefs, defKey);
    if (defKey && target) {
      if (stack.has(defKey)) return node;
      stack.add(defKey);
      const resolved = derefer(target, activeDefs, stack);
      stack.delete(defKey);
      const keys = Object.keys(node);
      if (keys.length === 1) return resolved;
      const { $ref: _, ...siblings } = node;
      for (const key of Object.keys(node)) delete (node as any)[key];
      Object.assign(node as any, resolved, siblings);
    }
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === '$defs') continue;
    node[k] = derefer(v, activeDefs, stack);
  }
  return node;
};

export const transformGeminiToolParameters = (
  parameters: JsonSchema
): JsonSchema => {
  if (
    !parameters ||
    typeof parameters !== 'object' ||
    Array.isArray(parameters)
  ) {
    return parameters;
  }

  let schema: JsonSchema = parameters;
  if ('$defs' in schema && typeof schema.$defs === 'object') {
    schema = derefer(schema);
    delete schema.$defs;
  }

  const isNullTypeNode = (node: any): boolean =>
    node && typeof node === 'object' && node.type === 'null';

  const transformNode = (node: JsonSchema): JsonSchema => {
    if (Array.isArray(node)) {
      return node.map(transformNode);
    }
    if (!node || typeof node !== 'object') return node;

    const transformed: JsonSchema = {};

    for (const [key, value] of Object.entries(node)) {
      if ((key === 'anyOf' || key === 'oneOf') && Array.isArray(value)) {
        const nonNullItems = value.filter((item) => !isNullTypeNode(item));
        const hadNull = nonNullItems.length < value.length;

        if (nonNullItems.length === 1 && hadNull) {
          // Flatten to single schema: get rid of anyOf/oneOf and set nullable: true
          const single = transformNode(nonNullItems[0]);
          if (single && typeof single === 'object') {
            Object.assign(transformed, single);
            transformed.nullable = true;
          }
          continue;
        }

        transformed[key] = transformNode(hadNull ? nonNullItems : value);
        if (hadNull) transformed.nullable = true;
        continue;
      }

      transformed[key] = transformNode(value);
    }
    return transformed;
  };

  return transformNode(schema);
};

// Vertex AI does not support additionalProperties in JSON Schema
// https://cloud.google.com/vertex-ai/docs/reference/rest/v1/Schema
export const recursivelyDeleteUnsupportedParameters = (obj: any) => {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return;
  delete obj.additional_properties;
  delete obj.additionalProperties;
  delete obj['$schema'];
  for (const key in obj) {
    if (obj[key] !== null && typeof obj[key] === 'object') {
      recursivelyDeleteUnsupportedParameters(obj[key]);
    }
    if (key == 'anyOf' && Array.isArray(obj[key])) {
      obj[key].forEach((item: any) => {
        recursivelyDeleteUnsupportedParameters(item);
      });
    }
  }
};

// Generate Gateway specific response.
export const GoogleResponseHandler = (
  response: Response | string | Record<string, unknown>,
  status: number
) => {
  if (status !== 200) {
    return new Response(
      JSON.stringify({
        success: false,
        error: response,
        param: null,
        provider: GOOGLE_VERTEX_AI,
      }),
      { status: status || 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!(response instanceof Response)) {
    const _response =
      typeof response === 'object' ? JSON.stringify(response) : response;
    return new Response(_response as string, {
      status: status || 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return response as Response;
};

export const googleBatchStatusToOpenAI = (
  status: GoogleBatchRecord['state']
) => {
  switch (status) {
    case 'JOB_STATE_CANCELLING':
      return 'cancelling';
    case 'JOB_STATE_CANCELLED':
      return 'cancelled';
    case 'JOB_STATE_EXPIRED':
      return 'expired';
    case 'JOB_STATE_FAILED':
      return 'failed';
    case 'JOB_STATE_PARTIALLY_SUCCEEDED':
    case 'JOB_STATE_SUCCEEDED':
      return 'completed';
    case 'JOB_STATE_RUNNING':
    case 'JOB_STATE_UPDATING':
      return 'in_progress';
    case 'JOB_STATE_PAUSED':
    case 'JOB_STATE_PENDING':
    case 'JOB_STATE_QUEUED':
    case 'JOB_STATE_UNSPECIFIED':
    default:
      return 'validating';
  }
};

export const googleFinetuneStatusToOpenAI = (
  status: GoogleFinetuneRecord['state']
) => {
  switch (status) {
    case 'JOB_STATE_CANCELLED':
    case 'JOB_STATE_CANCELLING':
    case 'JOB_STATE_EXPIRED':
      return 'cancelled';
    case 'JOB_STATE_FAILED':
      return 'failed';
    case 'JOB_STATE_PARTIALLY_SUCCEEDED':
    case 'JOB_STATE_SUCCEEDED':
      return 'succeeded';
    case 'JOB_STATE_PAUSED':
    case 'JOB_STATE_PENDING':
    case 'JOB_STATE_QUEUED':
      return 'queued';
    case 'JOB_STATE_RUNNING':
    case 'JOB_STATE_UPDATING':
      return 'running';
    case 'JOB_STATE_UNSPECIFIED':
      return 'queued';
    default:
      return 'queued';
  }
};

const getTimeKey = (status: GoogleBatchRecord['state'], value: string) => {
  if (status === 'JOB_STATE_FAILED') {
    return { failed_at: new Date(value).getTime() };
  }

  if (status === 'JOB_STATE_SUCCEEDED') {
    return { completed_at: new Date(value).getTime() };
  }

  if (status === 'JOB_STATE_CANCELLED') {
    return { cancelled_at: new Date(value).getTime() };
  }

  if (status === 'JOB_STATE_EXPIRED') {
    return { failed_at: new Date(value).getTime() };
  }
  return {};
};

export const GoogleToOpenAIBatch = (response: GoogleBatchRecord) => {
  const jobId = response.name.split('/').at(-1);
  const total = Object.values(response.completionStats ?? {}).reduce(
    (acc, current) => acc + Number.parseInt(current),
    0
  );

  const endpoint = isEmbeddingModel(response.model)
    ? BatchEndpoints.EMBEDDINGS
    : BatchEndpoints.CHAT_COMPLETIONS;

  const fileSuffix =
    endpoint === BatchEndpoints.EMBEDDINGS
      ? '000000000000.jsonl'
      : 'predictions.jsonl';

  const outputFileId = response.outputInfo
    ? `${response.outputInfo?.gcsOutputDirectory}/${fileSuffix}`
    : response.outputConfig.gcsDestination.outputUriPrefix;

  return {
    id: jobId,
    object: 'batch',
    endpoint: endpoint,
    input_file_id: encodeURIComponent(
      response.inputConfig.gcsSource?.uris?.at(0) ?? ''
    ),
    completion_window: null,
    status: googleBatchStatusToOpenAI(response.state),
    output_file_id: encodeURIComponent(outputFileId),
    // Same as output_file_id
    error_file_id: encodeURIComponent(
      response.outputConfig.gcsDestination.outputUriPrefix ?? ''
    ),
    created_at: new Date(response.createTime).getTime(),
    ...getTimeKey(response.state, response.endTime),
    in_progress_at: new Date(response.startTime).getTime(),
    ...getTimeKey(response.state, response.updateTime),
    request_counts: {
      total: total,
      completed: response.completionStats?.successfulCount,
      failed: response.completionStats?.failedCount,
    },
    ...(response.error && {
      errors: {
        object: 'list',
        data: [response.error],
      },
    }),
  };
};

export const transformVertexLogprobs = (
  generation: GoogleResponseCandidate
) => {
  const logprobsContent: Logprobs[] = [];
  if (!generation.logprobsResult) return null;
  if (generation.logprobsResult?.chosenCandidates) {
    generation.logprobsResult.chosenCandidates.forEach((candidate) => {
      const bytes = [];
      for (const char of candidate.token) {
        bytes.push(char.charCodeAt(0));
      }
      logprobsContent.push({
        token: candidate.token,
        logprob: candidate.logProbability,
        bytes: bytes,
      });
    });
  }
  if (generation.logprobsResult?.topCandidates) {
    generation.logprobsResult.topCandidates.forEach(
      (topCandidatesForIndex, index) => {
        const topLogprobs = [];
        for (const candidate of topCandidatesForIndex.candidates) {
          const bytes = [];
          for (const char of candidate.token) {
            bytes.push(char.charCodeAt(0));
          }
          topLogprobs.push({
            token: candidate.token,
            logprob: candidate.logProbability,
            bytes: bytes,
          });
        }
        logprobsContent[index].top_logprobs = topLogprobs;
      }
    );
  }
  return logprobsContent;
};

const populateHyperparameters = (value: FinetuneRequest) => {
  let hyperParameters = value.hyperparameters ?? {};

  if (value.method) {
    const method = value.method.type;
    hyperParameters = value.method?.[method]?.hyperparameters ?? {};
  }

  return {
    epochCount: hyperParameters?.n_epochs,
    learningRateMultiplier: hyperParameters?.learning_rate_multiplier,
    adapterSize: hyperParameters?.batch_size,
  };
};

export const transformVertexFinetune = (params: FinetuneRequest) => {
  const parameterSpec = {
    training_dataset_uri: decodeURIComponent(params['training_file'] ?? ''),
    ...(params['validation_file'] && {
      validation_dataset_uri: decodeURIComponent(params['validation_file']),
    }),
    hyperParameters: populateHyperparameters(params),
  };
  return parameterSpec;
};

export const getBucketAndFile = (uri: string) => {
  if (!uri) return { bucket: '', file: '' };
  let _url = decodeURIComponent(uri);
  _url = _url.replaceAll('gs://', '');
  const parts = _url.split('/');
  const bucket = parts[0];
  const file = parts.slice(1).join('/');
  return { bucket, file };
};

export const GoogleToOpenAIFinetune = (response: GoogleFinetuneRecord) => {
  return {
    id: response.name.split('/').at(-1),
    object: 'finetune',
    status: googleFinetuneStatusToOpenAI(response.state),
    created_at: new Date(response.createTime).getTime(),
    error: response.error,
    fine_tuned_model: response.tunedModel?.model,
    ...(response.endTime && {
      finished_at: new Date(response.endTime).getTime(),
    }),
    hyperparameters: {
      batch_size: response.supervisedTuningSpec.hyperParameters?.adapterSize,
      learning_rate_multiplier:
        response.supervisedTuningSpec.hyperParameters.learningRateMultiplier,
      n_epochs: response.supervisedTuningSpec.hyperParameters.epochCount,
    },
    model: response.baseModel ?? response.source_model?.baseModel,
    trained_tokens:
      response.tuningDataStats?.supervisedTuningDataStats
        .totalBillableTokenCount,
    training_file: encodeURIComponent(
      response.supervisedTuningSpec.trainingDatasetUri
    ),
    ...(response.supervisedTuningSpec.validationDatasetUri && {
      validation_file: encodeURIComponent(
        response.supervisedTuningSpec.validationDatasetUri
      ),
    }),
  };
};

export const vertexRequestLineHandler = (
  purpose: string,
  vertexBatchEndpoint: BatchEndpoints,
  transformedBody: any,
  requestId: string
) => {
  switch (purpose) {
    case 'batch':
      return vertexBatchEndpoint === BatchEndpoints.EMBEDDINGS
        ? { ...transformedBody, requestId: requestId }
        : { request: transformedBody, requestId: requestId };
    case 'fine-tune':
      return transformedBody;
  }
};

export const generateSignedURL = async (
  serviceAccountInfo: Record<string, any>,
  bucketName: string,
  objectName: string,
  expiration: number = 604800,
  httpMethod: string = 'GET',
  queryParameters: Record<string, string> = {},
  headers: Record<string, string> = {}
): Promise<string> => {
  if (expiration > 604800) {
    throw new Error(
      "Expiration Time can't be longer than 604800 seconds (7 days)."
    );
  }

  const escapedObjectName = encodeURIComponent(objectName).replace(/%2F/g, '/');
  const canonicalUri = `/${escapedObjectName}`;

  const datetimeNow = new Date();
  const requestTimestamp = datetimeNow
    .toISOString()
    .replace(/[-:]/g, '') // Remove hyphens and colons
    .replace(/\.\d{3}Z$/, 'Z'); // Remove milliseconds and ensure Z at end
  const datestamp = datetimeNow.toISOString().slice(0, 10).replace(/-/g, '');

  const clientEmail = serviceAccountInfo.client_email;
  const credentialScope = `${datestamp}/auto/storage/goog4_request`;
  const credential = `${clientEmail}/${credentialScope}`;

  const host = `${bucketName}.storage.googleapis.com`;
  headers['host'] = host;

  // Create canonical headers
  let canonicalHeaders = '';
  const orderedHeaders = Object.keys(headers).sort();
  for (const key of orderedHeaders) {
    const lowerKey = key.toLowerCase();
    const value = headers[key].toLowerCase();
    canonicalHeaders += `${lowerKey}:${value}\n`;
  }

  // Create signed headers
  const signedHeaders = orderedHeaders
    .map((key) => key.toLowerCase())
    .join(';');

  // Add required query parameters
  const queryParams: Record<string, string> = {
    ...queryParameters,
    'X-Goog-Algorithm': 'GOOG4-RSA-SHA256',
    'X-Goog-Credential': credential,
    'X-Goog-Date': requestTimestamp,
    'X-Goog-Expires': expiration.toString(),
    'X-Goog-SignedHeaders': signedHeaders,
  };

  // Create canonical query string
  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map(
      (key) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(queryParams[key])}`
    )
    .join('&');

  // Create canonical request
  const canonicalRequest = [
    httpMethod,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  // Hash the canonical request
  const canonicalRequestHash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalRequest)
  );

  // Create string to sign
  const stringToSign = [
    'GOOG4-RSA-SHA256',
    requestTimestamp,
    credentialScope,
    Array.from(new Uint8Array(canonicalRequestHash))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(''),
  ].join('\n');

  // Sign the string
  const privateKey = await importPrivateKey(serviceAccountInfo.private_key);
  const signature = await crypto.subtle.sign(
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: { name: 'SHA-256' },
    },
    privateKey,
    new TextEncoder().encode(stringToSign)
  );

  // Convert signature to hex
  const signatureHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Construct the final URL
  const schemeAndHost = `https://${host}`;
  return `${schemeAndHost}${canonicalUri}?${canonicalQueryString}&x-goog-signature=${signatureHex}`;
};

export const isEmbeddingModel = (modelName: string) => {
  return modelName.includes('embedding');
};

export const OPENAI_AUDIO_FORMAT_TO_VERTEX_MIME_TYPE_MAPPING = {
  mp3: 'audio/mp3',
  wav: 'audio/wav',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  pcm16: 'audio/pcm',
  'x-aac': 'audio/aac',
  'x-m4a': 'audio/m4a',
  mpeg: 'audio/mpeg',
  mpga: 'audio/mpga',
  mp4: 'audio/mp4',
  webm: 'audio/webm',
};

export const transformInputAudioPart = (c: ContentType): GoogleMessagePart => {
  const data = c.input_audio?.data;
  const mimeType =
    OPENAI_AUDIO_FORMAT_TO_VERTEX_MIME_TYPE_MAPPING[
      c.input_audio
        ?.format as keyof typeof OPENAI_AUDIO_FORMAT_TO_VERTEX_MIME_TYPE_MAPPING
    ];
  return {
    inlineData: {
      data: data ?? '',
      mimeType,
    },
  };
};

export const googleTools = [
  'googleSearch',
  'google_search',
  'googleSearchRetrieval',
  'google_search_retrieval',
  'computerUse',
  'computer_use',
];

export const transformGoogleTools = (tool: Tool) => {
  const tools: any = [];
  // This function is called only when tool.function exists
  if (!tool.function) return tools;

  if (['googleSearch', 'google_search'].includes(tool.function.name)) {
    const timeRangeFilter = tool.function.parameters?.timeRangeFilter;
    tools.push({
      googleSearch: {
        // allow null
        ...(timeRangeFilter !== undefined && { timeRangeFilter }),
      },
    });
  } else if (
    ['googleSearchRetrieval', 'google_search_retrieval'].includes(
      tool.function.name
    )
  ) {
    tools.push(buildGoogleSearchRetrievalTool(tool));
  } else if (['computerUse', 'computer_use'].includes(tool.function.name)) {
    tools.push({
      computerUse: {
        environment: tool.function.parameters?.environment,
        excludedPredefinedFunctions:
          tool.function.parameters?.excluded_predefined_functions,
      },
    });
  }
  return tools;
};

export const buildGoogleSearchRetrievalTool = (tool: Tool) => {
  const googleSearchRetrievalTool: GoogleSearchRetrievalTool = {
    googleSearchRetrieval: {},
  };
  // This function is called only when tool.function exists
  if (tool.function?.parameters?.dynamicRetrievalConfig) {
    googleSearchRetrievalTool.googleSearchRetrieval.dynamicRetrievalConfig =
      tool.function.parameters.dynamicRetrievalConfig;
  }
  return googleSearchRetrievalTool;
};
