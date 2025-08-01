import { RequestHandler } from '../types';
import { GoogleBatchRecord } from './types';
import { getModelAndProvider, isEmbeddingModel } from './utils';
import { responseTransformers } from '../open-ai-base';
import {
  GoogleChatCompleteResponseTransform,
  VertexAnthropicChatCompleteResponseTransform,
  VertexLlamaChatCompleteResponseTransform,
} from './chatComplete';
import { BatchEndpoints, GOOGLE_VERTEX_AI } from '../../globals';
import { createLineSplitter } from '../../handlers/streamHandlerUtils';
import GoogleApiConfig from './api';
import { GoogleEmbedResponseTransform } from './embed';

const responseTransforms = {
  google: {
    [BatchEndpoints.CHAT_COMPLETIONS]: GoogleChatCompleteResponseTransform,
    [BatchEndpoints.EMBEDDINGS]: GoogleEmbedResponseTransform,
  },
  anthropic: {
    [BatchEndpoints.CHAT_COMPLETIONS]:
      VertexAnthropicChatCompleteResponseTransform,
    [BatchEndpoints.EMBEDDINGS]: null,
  },
  meta: {
    [BatchEndpoints.CHAT_COMPLETIONS]: VertexLlamaChatCompleteResponseTransform,
    [BatchEndpoints.EMBEDDINGS]: null,
  },
  endpoints: {
    [BatchEndpoints.CHAT_COMPLETIONS]: responseTransformers(GOOGLE_VERTEX_AI, {
      chatComplete: true,
    }).chatComplete,
    [BatchEndpoints.EMBEDDINGS]: responseTransformers(GOOGLE_VERTEX_AI, {
      embed: true,
    }).embed,
  },
};

type TransformFunction = (
  response: unknown,
  responseStatus: number,
  headers: Record<string, string>,
  strictOpenAiCompliance: boolean,
  gatewayRequestUrl: string,
  gatewayRequest: Params
) => Record<string, unknown>;

const getOpenAIBatchRow = ({
  row,
  batchId,
  transform,
  endpoint,
  modelName,
}: {
  row: Record<string, unknown>;
  transform: TransformFunction;
  batchId: string;
  endpoint: BatchEndpoints;
  modelName: string;
}) => {
  const response =
    endpoint === BatchEndpoints.EMBEDDINGS
      ? ((row ?? {}) as Record<string, unknown>)
      : ((row['response'] ?? {}) as Record<string, unknown>);
  const id = `batch-${batchId}-${response.responseId ? `-${response.responseId}` : ''}`;

  let error = null;
  try {
    error = JSON.parse(row.status as string);
  } catch {
    error = row.status;
  }

  return {
    id,
    custom_id:
      row.requestId || (row?.instance as any)?.requestId || response.responseId,
    response: {
      ...(!error && { status_code: 200 }),
      request_id: id,
      body:
        !error && transform(response, 200, {}, false, '', { model: modelName }),
    },
    error: error,
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
  let modelName = '';
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

  const batchEndpoint = isEmbeddingModel(modelName)
    ? BatchEndpoints.EMBEDDINGS
    : BatchEndpoints.CHAT_COMPLETIONS;

  const providerConfigMap =
    responseTransforms[provider as keyof typeof responseTransforms];
  const providerConfig =
    providerConfigMap?.[batchEndpoint] ??
    responseTransforms['endpoints'][batchEndpoint];

  if (!providerConfig) {
    throw new Error(
      `Endpoint ${endpoint} not supported for provider ${provider}`
    );
  }

  outputURL = outputURL.replace('gs://', 'https://storage.googleapis.com/');

  const predictionFileId =
    endpoint === BatchEndpoints.EMBEDDINGS
      ? '000000000000.jsonl'
      : 'predictions.jsonl';

  const outputResponse = await fetch(
    `${outputURL}/${predictionFileId}`,
    options
  );

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
          transform: providerConfig as TransformFunction,
          endpoint: batchEndpoint,
          modelName,
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
