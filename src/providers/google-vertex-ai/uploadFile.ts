import { ProviderConfig, RequestHandler } from '../types';
import {
  generateSignedURL,
  getModelAndProvider,
  GoogleResponseHandler,
  vertexRequestLineHandler,
} from './utils';
import {
  VertexAnthropicChatCompleteConfig,
  VertexGoogleChatCompleteConfig,
  VertexLlamaChatCompleteConfig,
} from './chatComplete';
import { chatCompleteParams, embedParams } from '../open-ai-base';
import { BatchEndpoints, POWERED_BY } from '../../globals';
import { transformUsingProviderConfig } from '../../services/transformToProviderRequest';
import { createLineSplitter } from '../../handlers/streamHandlerUtils';
import GoogleApiConfig from './api';
import { VertexBatchEmbedConfig } from './embed';
import { GatewayError } from '../../errors/GatewayError';

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

const encoder = new TextEncoder();

export const GoogleFileUploadRequestHandler: RequestHandler<
  ReadableStream
> = async ({ c, providerOptions, requestBody, requestHeaders }) => {
  const {
    vertexStorageBucketName,
    filename,
    vertexModelName,
    vertexBatchEndpoint = BatchEndpoints.CHAT_COMPLETIONS, //default to inference endpoint
  } = providerOptions;

  let purpose = requestHeaders['x-portkey-file-purpose'] ?? '';
  if (
    (purpose === 'upload' ? false : !vertexModelName) ||
    !vertexStorageBucketName
  ) {
    return GoogleResponseHandler(
      'Invalid request, please provide `x-portkey-provider-model` and `x-portkey-vertex-storage-bucket-name` in the request headers',
      400
    );
  }

  const objectKey = filename ?? `${crypto.randomUUID()}.jsonl`;
  const bytes = requestHeaders['content-length'];
  const { provider } = getModelAndProvider(vertexModelName ?? '');
  const providerConfigMap =
    PROVIDER_CONFIG[provider as keyof typeof PROVIDER_CONFIG];

  const providerConfig =
    providerConfigMap?.[vertexBatchEndpoint] ??
    PROVIDER_CONFIG['endpoints'][vertexBatchEndpoint];

  if (!providerConfig) {
    throw new GatewayError(
      `Endpoint ${vertexBatchEndpoint} not supported for provider ${provider}`
    );
  }

  let isPurposeHeader = false;
  let transformStream: ReadableStream<any> | TransformStream<any, any> =
    requestBody;
  let uploadMethod = 'PUT';
  // Create a reusable line splitter stream
  const lineSplitter = createLineSplitter();

  if (purpose === 'upload') {
    uploadMethod = 'POST';
  } else {
    // Transform stream to process each complete line.
    transformStream = new TransformStream({
      transform: function (chunk, controller) {
        let buffer;
        try {
          const _chunk = chunk.toString();

          const match = _chunk.match(/name="([^"]+)"/);
          const headerKey = match ? match[1] : null;

          if (headerKey && headerKey === 'purpose') {
            isPurposeHeader = true;
            return;
          }

          if (isPurposeHeader && _chunk?.length > 0 && !purpose) {
            isPurposeHeader = false;
            purpose = _chunk.trim();
            return;
          }

          if (!_chunk) {
            return;
          }

          const json = JSON.parse(chunk.toString());

          if (json && !purpose) {
            // Close the stream.
            controller.terminate();
          }

          const toTranspose = purpose === 'batch' ? json.body : json;
          const transformedBody = transformUsingProviderConfig(
            providerConfig,
            toTranspose,
            providerOptions
          );

          delete transformedBody['model'];

          const bufferTransposed = vertexRequestLineHandler(
            purpose,
            vertexBatchEndpoint,
            transformedBody,
            json['custom_id']
          );

          buffer = JSON.stringify(bufferTransposed);
        } catch {
          buffer = null;
        } finally {
          if (buffer) {
            controller.enqueue(encoder.encode(buffer + '\n'));
          }
        }
      },
      flush(controller) {
        controller.terminate();
      },
    });
    requestBody.pipeThrough(lineSplitter).pipeTo(transformStream.writable);
  }

  // Pipe the node stream through our line splitter and into the transform stream.

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

  const options = {
    body:
      uploadMethod === 'POST'
        ? (transformStream as ReadableStream<any>)
        : (transformStream as TransformStream).readable,
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
    const request = await fetch(url, { ...options });
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
