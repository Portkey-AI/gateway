import { ProviderConfig, RequestHandler } from '../types';
import {
  generateSignedURL,
  getModelAndProvider,
  getModelProviderFromModelID,
  GoogleResponseHandler,
  vertexRequestLineHandler,
} from './utils';
import {
  VertexAnthropicChatCompleteConfig,
  VertexGoogleChatCompleteConfig,
  VertexLlamaChatCompleteConfig,
} from './chatComplete';
import { chatCompleteParams, embedParams } from '../open-ai-base';
import { transformUsingProviderConfig } from '../../services/transformToProviderRequest';
import { nodeLineReader } from '../../handlers/streamHandlerUtils';
import GoogleApiConfig from './api';
import { BatchEndpoints } from '../../globals';
import { VertexBatchEmbedConfig } from './embed';
import { Readable, Transform } from 'stream';
import { externalServiceFetchWithNodeFetch } from '../../utils/fetch';
import { getRuntimeKey } from 'hono/adapter';

const runtime = getRuntimeKey();

const PROVIDER_CONFIG: Record<
  string,
  Partial<Record<BatchEndpoints, ProviderConfig>>
> = {
  google: {
    [BatchEndpoints.CHAT_COMPLETIONS]: VertexGoogleChatCompleteConfig,
    [BatchEndpoints.EMBEDDINGS]: VertexBatchEmbedConfig,
  },
  anthropic: {
    [BatchEndpoints.CHAT_COMPLETIONS]: VertexAnthropicChatCompleteConfig,
  },
  meta: {
    [BatchEndpoints.CHAT_COMPLETIONS]: VertexLlamaChatCompleteConfig,
  },
  endpoints: {
    [BatchEndpoints.CHAT_COMPLETIONS]: chatCompleteParams(['model']),
    [BatchEndpoints.EMBEDDINGS]: embedParams(['model']),
  },
};

export const GoogleFileUploadRequestHandler: RequestHandler<
  ReadableStream
> = async ({ c, providerOptions, requestBody, requestHeaders }) => {
  const {
    vertexStorageBucketName,
    filename,
    vertexModelName,
    vertexBatchEndpoint = BatchEndpoints.CHAT_COMPLETIONS, //default to inference endpoint
  } = providerOptions;

  if (!vertexModelName || !vertexStorageBucketName) {
    return GoogleResponseHandler(
      'Invalid request, please provide `x-portkey-provider-model` and `x-portkey-vertex-storage-bucket-name` in the request headers',
      400
    );
  }

  const objectKey = filename ?? `${crypto.randomUUID()}.jsonl`;
  const bytes = requestHeaders['content-length'];
  let finalVertexModelName = vertexModelName ?? '';
  if (
    finalVertexModelName.startsWith('projects') ||
    finalVertexModelName.startsWith('publisher')
  ) {
    finalVertexModelName = finalVertexModelName.split('/').at(-1) || '';

    const model = await getModelProviderFromModelID(
      finalVertexModelName,
      providerOptions
    );

    if (model) {
      finalVertexModelName = model;
    }
  }

  const { provider: modelProvider } = getModelAndProvider(
    finalVertexModelName ?? ''
  );

  const providerConfigMap =
    PROVIDER_CONFIG[modelProvider as keyof typeof PROVIDER_CONFIG];

  const providerConfig =
    providerConfigMap?.[vertexBatchEndpoint] ??
    PROVIDER_CONFIG['endpoints'][vertexBatchEndpoint];

  if (!providerConfig) {
    throw new Error(
      `Endpoint ${vertexBatchEndpoint} not supported for provider ${modelProvider}`
    );
  }

  let isPurposeHeader = false;
  let purpose = requestHeaders['x-portkey-file-purpose'] ?? '';
  let transformStream;
  let uploadMethod = 'PUT';

  if (purpose === 'upload') {
    transformStream = Readable.fromWeb(requestBody as any);
    uploadMethod = 'POST';
  } else {
    // Transform stream to process each complete line.
    transformStream = new Transform({
      transform: function (chunk, _, callback) {
        let buffer;
        try {
          const _chunk = chunk.toString();

          const match = _chunk.match(/name="([^"]+)"/);
          const headerKey = match ? match[1] : null;

          if (headerKey && headerKey === 'purpose') {
            isPurposeHeader = true;
            callback();
            return;
          }

          if (isPurposeHeader && _chunk?.length > 0 && !purpose) {
            isPurposeHeader = false;
            purpose = _chunk.trim();
            callback();
            return;
          }

          if (!_chunk) {
            callback();
            return;
          }

          const json = JSON.parse(chunk.toString());
          if (json && !purpose) {
            // Close the stream.
            this.end();
            callback();
            return;
          }

          const toTranspose = purpose === 'batch' ? json.body : json;
          const transformedBody = transformUsingProviderConfig(
            providerConfig,
            toTranspose
          );

          delete transformedBody['model'];

          const bufferTransposed = vertexRequestLineHandler(
            purpose,
            vertexBatchEndpoint,
            transformedBody,
            json['custom_id']
          );
          buffer = JSON.stringify(bufferTransposed);
        } catch (error) {
          buffer = null;
        } finally {
          if (buffer) {
            this.push(buffer + '\n');
          }
        }
        callback();
      },
      flush: function (callback) {
        callback();
        this.end();
      },
    });

    const lineReader = nodeLineReader();
    const webStream = Readable.fromWeb(requestBody as any);

    webStream.pipe(lineReader);
    lineReader.pipe(transformStream);
  }

  const providerHeaders = await GoogleApiConfig.headers({
    c,
    providerOptions,
    fn: 'uploadFile',
    transformedRequestBody: {},
    transformedRequestUrl: '',
    gatewayRequestBody: {},
  });

  const encodedFile = encodeURIComponent(objectKey ?? '');
  let url;
  if (uploadMethod !== 'POST') {
    url = `https://storage.googleapis.com/${vertexStorageBucketName}/${encodedFile}`;
  } else {
    url = await generateSignedURL(
      providerOptions.vertexServiceAccountJson ?? {},
      vertexStorageBucketName,
      objectKey,
      10 * 60,
      'POST',
      c.req.param(),
      {}
    );
  }

  const body =
    runtime === 'workerd'
      ? (Readable.toWeb(transformStream) as any)
      : transformStream;
  const options = {
    body: body,
    headers: {
      ...(uploadMethod !== 'POST'
        ? { Authorization: providerHeaders.Authorization }
        : {}),
      'Content-Type':
        uploadMethod === 'POST'
          ? requestHeaders['content-type']
          : 'application/octet-stream',
    },
    method: uploadMethod,
    duplex: 'half',
  };

  try {
    const request = await externalServiceFetchWithNodeFetch(url, {
      ...options,
    });
    if (!request.ok) {
      const error = await request.text();
      return GoogleResponseHandler(error, request.status);
    }

    const response = {
      filename: filename,
      id: encodeURIComponent(`gs://${vertexStorageBucketName}/${objectKey}`),
      object: 'file',
      create_at: Date.now(),
      purpose: purpose,
      bytes: Number.parseInt(bytes ?? '0'),
      status: 'processed',
    };

    return GoogleResponseHandler(response, 200);
  } catch (error) {
    if (!purpose) {
      return new Response(
        JSON.stringify({ message: 'Purpose is not set', success: false }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ message: 'Something went wrong', success: false }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const GoogleFileUploadResponseTransform = (response: Response) => {
  return response;
};
