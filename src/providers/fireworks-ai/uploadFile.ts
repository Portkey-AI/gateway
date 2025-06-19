import { GatewayError } from '../../errors/GatewayError';
import { createLineSplitter } from '../../handlers/streamHandlerUtils';
import { RequestHandler } from '../types';
import FireworksAIAPIConfig from './api';
import { createDataset, getUploadEndpoint, validateDataset } from './utils';

export const FireworksFileUploadResponseTransform = (response: any) => {
  return response;
};

const encoder = new TextEncoder();

export const FireworkFileUploadRequestHandler: RequestHandler<
  ReadableStream
> = async ({ requestURL, requestBody, providerOptions, c, requestHeaders }) => {
  const headers = await FireworksAIAPIConfig.headers({
    c,
    providerOptions,
    fn: 'uploadFile',
    transformedRequestBody: requestBody,
    transformedRequestUrl: requestURL,
  });

  const { fireworksFileLength } = providerOptions;

  const contentLength =
    Number.parseInt(fireworksFileLength || requestHeaders['content-length']) +
    1;

  const baseURL = await FireworksAIAPIConfig.getBaseURL({
    c,
    providerOptions,
    gatewayRequestURL: requestURL,
  });

  const datasetId = crypto.randomUUID();

  const { created, error: createError } = await createDataset({
    datasetId,
    baseURL,
    headers,
  });

  if (!created || createError) {
    throw new GatewayError(createError || 'Failed to create dataset');
  }

  const { endpoint: preSignedUrl, error } = await getUploadEndpoint({
    baseURL,
    contentLength,
    datasetId,
    headers,
  });

  if (error || !preSignedUrl) {
    throw new GatewayError(
      error || 'Failed to get upload endpoint for firework-ai'
    );
  }
  // body might contain headers of form-data, cleaning it to match the content-length for gcs URL.
  const streamBody = new TransformStream({
    transform(chunk, controller) {
      try {
        JSON.parse(chunk);
        const encodedChunk = encoder.encode(chunk + '\n');
        controller.enqueue(encodedChunk);
      } catch {
        return;
      }
    },
    flush(controller) {
      controller.terminate();
    },
  });

  const lineSplitter = createLineSplitter();

  requestBody.pipeThrough(lineSplitter).pipeTo(streamBody.writable);

  try {
    const options = {
      method: 'PUT',
      body: streamBody.readable,
      duplex: 'half',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-goog-content-length-range': `${contentLength},${contentLength}`,
      },
    };

    const uploadResponse = await fetch(preSignedUrl, options);

    if (!uploadResponse.ok) {
      throw new GatewayError('Failed to upload file');
    }

    const { valid, error } = await validateDataset({
      datasetId,
      baseURL,
      headers,
    });

    if (!valid || error) {
      throw new GatewayError(error || 'Failed to validate dataset');
    }

    const fileResponse = {
      id: datasetId,
      bytes: contentLength,
      create_at: Date.now(),
      filename: `${datasetId}.jsonl`,
      status: 'processed',
      purpose: 'fine-tune',
    };

    return new Response(JSON.stringify(fileResponse), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    throw new GatewayError(
      (error as Error).message || 'Failed to upload file to firework-ai'
    );
  }
};
