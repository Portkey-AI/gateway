import { RequestHandler } from '../types';
import { getModelAndProvider, GoogleResponseHandler } from './utils';
import {
  VertexAnthropicChatCompleteConfig,
  VertexGoogleChatCompleteConfig,
  VertexLlamaChatCompleteConfig,
} from './chatComplete';
import { chatCompleteParams } from '../open-ai-base';
import { POWERED_BY } from '../../globals';
import { transformUsingProviderConfig } from '../../services/transformToProviderRequest';
import { createLineSplitter } from '../../handlers/streamHandlerUtils';
import GoogleApiConfig from './api';

const PROVIDER_CONFIG = {
  google: VertexGoogleChatCompleteConfig,
  anthropic: VertexAnthropicChatCompleteConfig,
  meta: VertexLlamaChatCompleteConfig,
  endpoints: chatCompleteParams(['model']),
};

const encoder = new TextEncoder();

export const GoogleFileUploadRequestHandler: RequestHandler<
  ReadableStream
> = async ({ c, providerOptions, requestBody, requestHeaders }) => {
  const { vertexStorageBucketName, filename, vertexModelName } =
    providerOptions;

  if (!vertexModelName || !vertexStorageBucketName) {
    return GoogleResponseHandler(
      'Invalid request, please provide `x-portkey-provider-model` and `x-portkey-vertex-storage-bucket-name` in the request headers',
      400
    );
  }

  const objectKey = filename ?? `${crypto.randomUUID()}.jsonl`;
  const bytes = requestHeaders['content-length'];
  const { provider } = getModelAndProvider(vertexModelName ?? '');
  let providerConfig =
    PROVIDER_CONFIG[provider as keyof typeof PROVIDER_CONFIG];

  if (!providerConfig) {
    providerConfig = PROVIDER_CONFIG['endpoints'];
  }

  let isPurposeHeader = false;
  let purpose = '';
  // Create a reusable line splitter stream
  const lineSplitter = createLineSplitter();

  // Transform stream to process each complete line.
  const transformStream = new TransformStream({
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
          toTranspose
        );

        delete transformedBody['model'];

        let bufferTransposed;
        if (purpose === 'fine-tune') {
          bufferTransposed = transformedBody;
        } else {
          bufferTransposed = {
            request: transformedBody,
          };
        }
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

  // Pipe the node stream through our line splitter and into the transform stream.
  requestBody.pipeThrough(lineSplitter).pipeTo(transformStream.writable);

  const providerHeaders = await GoogleApiConfig.headers({
    c,
    providerOptions,
    fn: 'uploadFile',
    transformedRequestBody: {},
    transformedRequestUrl: '',
    gatewayRequestBody: {},
  });

  const encodedFile = encodeURIComponent(objectKey ?? '');
  const url = `https://storage.googleapis.com/${vertexStorageBucketName}/${encodedFile}`;

  const options = {
    body: transformStream.readable,
    headers: {
      Authorization: providerHeaders.Authorization,
      'Content-Type': 'application/octet-stream',
    },
    method: 'PUT',
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
