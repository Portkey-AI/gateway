import { logger } from '../../apm';
import { GatewayError } from '../../errors/GatewayError';
import { FIREWORKS_AI } from '../../globals';
import { createLineSplitter } from '../../handlers/streamHandlerUtils';
import { externalServiceFetch } from '../../utils/fetch';
import { RequestHandler } from '../types';
import FireworksAIAPIConfig from './api';
import { createDataset, getUploadEndpoint, validateDataset } from './utils';

export const FireworksFileUploadResponseTransform = (response: any) => {
  return response;
};

export const FireworkFileUploadRequestHandler: RequestHandler<
  ReadableStream
> = async ({ requestURL, requestBody, providerOptions, c, requestHeaders }) => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const headers = await FireworksAIAPIConfig.headers({
    c,
    providerOptions,
    fn: 'uploadFile',
    transformedRequestBody: requestBody,
    transformedRequestUrl: requestURL,
  });

  const { fireworksFileLength } = providerOptions;

  const contentLength = Number.parseInt(
    fireworksFileLength || requestHeaders['content-length']
  );

  const baseURL = await FireworksAIAPIConfig.getBaseURL({
    c,
    providerOptions,
    gatewayRequestURL: requestURL,
  });

  const datasetId = `ft-${crypto.randomUUID()}`;

  const { created, error: createError } = await createDataset({
    datasetId,
    baseURL,
    headers,
  });

  if (!created || createError) {
    const errorResponse = {
      error: {
        code: 400,
        message: 'Failed to create dataset',
        provider: FIREWORKS_AI,
        details: {
          reason: createError || 'Failed to create dataset',
        },
      },
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  const { endpoint: preSignedUrl, error } = await getUploadEndpoint({
    baseURL,
    contentLength,
    datasetId,
    headers,
  });

  if (error || !preSignedUrl) {
    const errorResponse = {
      error: {
        code: 400,
        message: 'Failed to get upload endpoint',
        provider: FIREWORKS_AI,
        details: {
          reason: error || 'Failed to get upload endpoint',
        },
      },
    };
    return new Response(JSON.stringify(errorResponse), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  let length = 0;

  // body might contain headers of form-data, cleaning it to match the content-length for gcs URL.
  const streamBody = new TransformStream({
    transform(chunk, controller) {
      try {
        const decodedChunk = decoder.decode(chunk);
        JSON.parse(decodedChunk);
        length += chunk.length + 1;
        controller.enqueue(chunk);
        controller.enqueue(encoder.encode('\n'));
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

    const uploadResponse = await externalServiceFetch(preSignedUrl, options);

    // TODO: Remove this after testing.
    logger.info('File length from request - Actual file length', {
      contentLength,
      length,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      const errorResponse = {
        error: {
          code: 400,
          message: 'Unable to upload file',
          provider: FIREWORKS_AI,
          details: {
            reason: errorText,
            body: JSON.stringify({
              contentLength,
              datasetId,
            }),
          },
        },
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    }

    const { valid, error } = await validateDataset({
      datasetId,
      baseURL,
      headers,
    });

    if (!valid || error) {
      const errorResponse = {
        error: {
          code: 400,
          message: 'Failed to validate dataset',
          provider: FIREWORKS_AI,
          details: {
            reason: error || 'Failed to validate dataset',
          },
        },
      };
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      });
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
