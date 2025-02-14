// import { PassThrough, Transform } from 'stream';
import { Stream, Transform } from 'stream';
import { createInterface } from 'readline/promises';
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

const PROVIDER_CONFIG = {
  google: VertexGoogleChatCompleteConfig,
  anthropic: VertexAnthropicChatCompleteConfig,
  meta: VertexLlamaChatCompleteConfig,
  endpoints: chatCompleteParams(['model']),
};

export const GoogleFileUploadRequestHandler: RequestHandler<
  NodeWebStream
> = async ({ providerOptions, requestBody, requestHeaders }) => {
  const {
    vertexServiceAccountJson,
    apiKey,
    vertexStorageBucketName,
    filename,
    vertexModelName,
  } = providerOptions;

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

  // Transform to write and read at the same time.
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
          // File shouldn't have `model` param.
          delete transformedBody['model'];

          const bufferTransposed = {
            request: transformedBody,
          };
          buffer = JSON.stringify(bufferTransposed);
        }
      } catch {
        buffer = null;
      } finally {
        if (buffer) {
          this.push(buffer.toString() + '\n');
        }
        callback();
      }
    },
  });

  let authToken: string = apiKey || '';
  if (vertexServiceAccountJson) {
    authToken = `Bearer ${await getAccessToken(vertexServiceAccountJson)}`;
  }

  // Read the stream line by line.
  const read = async () => {
    return new Promise((resolve) => {
      const readInterface = createInterface({
        input: nodeStream,
        crlfDelay: Infinity,
      });

      readInterface.on('line', async (line) => {
        bodyStream.write(line);
      });

      readInterface.on('close', async () => {
        bodyStream.end();
        resolve(null);
      });
    });
  };

  read();

  const encodedFile = encodeURIComponent(objectKey ?? '');
  const url = `https://storage.googleapis.com/${vertexStorageBucketName}/${encodedFile}`;

  const options = {
    body: Stream.Readable.toWeb(bodyStream) as ReadableStream,
    headers: {
      Authorization: authToken,
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
