import { RequestHandler } from '../types';
import { GoogleBatchRecord } from './types';
import { getModelAndProvider } from './utils';
import { responseTransformers } from '../open-ai-base';
import {
  GoogleChatCompleteResponseTransform,
  VertexAnthropicChatCompleteResponseTransform,
  VertexLlamaChatCompleteResponseTransform,
} from './chatComplete';
import { GOOGLE_VERTEX_AI } from '../../globals';
import { createLineSplitter } from '../../handlers/streamHandlerUtils';
import GoogleApiConfig from './api';

const responseTransforms = {
  google: GoogleChatCompleteResponseTransform,
  anthropic: VertexAnthropicChatCompleteResponseTransform,
  meta: VertexLlamaChatCompleteResponseTransform,
  endpoints: responseTransformers(GOOGLE_VERTEX_AI, {
    chatComplete: true,
  }).chatComplete,
};

type TransformFunction = (response: unknown) => Record<string, unknown>;

const getOpenAIBatchRow = ({
  row,
  batchId,
  transform,
}: {
  row: Record<string, unknown>;
  transform: TransformFunction;
  batchId: string;
}) => {
  const response = (row['response'] ?? {}) as Record<string, unknown>;
  const id = `batch-${batchId}-${response.responseId}`;
  return {
    id,
    custom_id: response.responseId,
    response: {
      status_code: 200,
      request_id: id,
      body: transform(response),
    },
    error: null,
  };
};

export const BatchOutputRequestHandler: RequestHandler = async ({
  requestURL,
  providerOptions,
  c,
  requestBody,
}) => {
  const headers = await GoogleApiConfig.headers({
    c,
    fn: 'retrieveBatch',
    providerOptions,
    transformedRequestBody: requestBody,
    transformedRequestUrl: requestURL,
  });

  const options = {
    method: 'GET',
    headers,
  };

  // URL: <gateway>/v1/batches/<batchId>/output
  const batchId = requestURL.split('/').at(-2);

  const batchDetailsURL = requestURL.replace(/\/output$/, '');

  const baseURL = await GoogleApiConfig.getBaseURL({
    c,
    providerOptions,
    fn: 'retrieveBatch',
    gatewayRequestURL: batchDetailsURL,
  });

  const endpoint = GoogleApiConfig.getEndpoint({
    c,
    providerOptions,
    fn: 'retrieveBatch',
    gatewayRequestURL: batchDetailsURL,
    gatewayRequestBodyJSON: {},
  });

  const batchesURL = `${baseURL}${endpoint}`;
  let modelName;
  let outputURL;
  try {
    const response = await fetch(batchesURL, options);
    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }
    const data = (await response.json()) as GoogleBatchRecord;
    outputURL = data.outputInfo?.gcsOutputDirectory ?? '';
    modelName = data.model;
  } catch (error) {
    const errorMessage =
      (error as Error).message || 'Failed to retrieve batch output';
    throw new Error(errorMessage);
  }

  if (!outputURL) {
    throw new Error('Failed to retrieve batch details');
  }

  const { provider } = getModelAndProvider(modelName ?? '');
  let responseTransform =
    responseTransforms[provider as keyof typeof responseTransforms] ||
    responseTransforms['endpoints'];

  outputURL = outputURL.replace('gs://', 'https://storage.googleapis.com/');
  const outputResponse = await fetch(`${outputURL}/predictions.jsonl`, options);

  const reader = outputResponse.body;
  if (!reader) {
    throw new Error('Failed to retrieve batch output');
  }

  const encoder = new TextEncoder();

  // Prepare a transform stream to process complete lines.
  const responseStream = new TransformStream({
    transform(chunk, controller) {
      let buffer;
      try {
        const json = JSON.parse(chunk.toString());
        const row = getOpenAIBatchRow({
          row: json,
          batchId: batchId ?? '',
          transform: responseTransform as TransformFunction,
        });
        buffer = JSON.stringify(row);
      } catch (error) {
        return;
      }
      controller.enqueue(encoder.encode(buffer + '\n'));
    },
    flush(controller) {
      controller.terminate();
    },
  });

  const [safeStream] = responseStream.readable.tee();

  // Pipe the node stream through the line splitter and then to the response stream.
  const lineSplitter = createLineSplitter();
  reader.pipeThrough(lineSplitter).pipeTo(responseStream.writable);

  return new Response(safeStream, {
    headers: { 'Content-Type': 'application/octet-stream' },
  });
};

export const BatchOutputResponseTransform = async (response: Response) => {
  return response;
};
