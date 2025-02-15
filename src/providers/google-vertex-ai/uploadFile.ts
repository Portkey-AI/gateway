// import { PassThrough, Transform } from 'stream';
import { Stream, Transform } from 'stream';
import { ReadableStream as NodeWebStream } from 'stream/web';
import { RequestHandler } from '../types';
import {
  getAccessToken,
  getModelAndProvider,
  GoogleResponseHandler,
} from './utils';
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

export const GoogleFileUploadRequestHandler: RequestHandler<
  NodeWebStream
> = async ({ c, providerOptions, requestBody, requestHeaders }) => {
  const { vertexStorageBucketName, filename, vertexModelName } =
    providerOptions;

  if (!vertexModelName || !vertexStorageBucketName) {
    return GoogleResponseHandler(
      'Invalid request, please provide `x-portkey-vertex-provider-model` and `x-portkey-vertex-storage-bucket-name` in the request headers',
      400
    );
  }

  const objectKey = filename ?? `${crypto.randomUUID()}.jsonl`;
  const bytes = requestHeaders['content-length'];
  const purpose = requestHeaders[`x-${POWERED_BY}-file-purpose`] ?? 'batch';
  const { provider } = getModelAndProvider(vertexModelName ?? '');
  let providerConfig =
    PROVIDER_CONFIG[provider as keyof typeof PROVIDER_CONFIG];

  if (!providerConfig) {
    providerConfig = PROVIDER_CONFIG['endpoints'];
  }

  // Convert web stream to node stream
  const nodeStream = Stream.Readable.fromWeb(requestBody);

  // Create a reusable line splitter stream
  const lineSplitter = createLineSplitter();

  // Transform stream to process each complete line.
  const bodyStream = new Transform({
    decodeStrings: false,
    transform(chunk, _, callback) {
      let buffer;
      try {
        const json = JSON.parse(chunk.toString());
        if (purpose === 'batch') {
          const transformedBody = transformUsingProviderConfig(
            providerConfig,
            json.body
          );
          // Remove model parameter from file
          delete transformedBody['model'];
          buffer = JSON.stringify({ request: transformedBody });
        }
      } catch {
        buffer = null;
      } finally {
        if (buffer) {
          this.push(buffer + '\n');
        }
        callback();
      }
    },
  });

  // Pipe the node stream through our line splitter and into the transform stream.
  nodeStream.pipe(lineSplitter).pipe(bodyStream);

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
    body: Stream.Readable.toWeb(bodyStream) as ReadableStream,
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
    console.log(error, 'error');
    return new Response(
      JSON.stringify({ message: 'Something went wrong', success: false }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const GoogleFileUploadResponseTransform = (response: Response) => {
  return response;
};
