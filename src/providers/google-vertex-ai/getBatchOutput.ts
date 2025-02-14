import { Stream, Transform } from 'node:stream';
import { GoogleBatchRecord, RequestHandler } from '../types';
import { getAccessToken, getModelAndProvider } from './utils';
import { createInterface } from 'node:readline/promises';
import { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { responseTransformers } from '../open-ai-base';
import {
  GoogleChatCompleteResponseTransform,
  VertexAnthropicChatCompleteResponseTransform,
  VertexLlamaChatCompleteResponseTransform,
} from './chatComplete';
import { GOOGLE_VERTEX_AI } from '../../globals';

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
    id: id,
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
}) => {
  const { vertexProjectId, vertexRegion, vertexServiceAccountJson, apiKey } =
    providerOptions;
  let authToken = apiKey;
  let projectId = vertexProjectId;

  if (vertexServiceAccountJson) {
    authToken = await getAccessToken(vertexServiceAccountJson);
    projectId = vertexServiceAccountJson.project_id;
  }

  const options = {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
  };

  // url: <gateway>/v1/batches/<batchId>/output
  const batchId = requestURL.split('/').at(-2);

  const batchDetailsURL = `https://${vertexRegion}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${vertexRegion}/batchPredictionJobs/${batchId}`;
  let modelName;
  let outputURL;
  try {
    const response = await fetch(batchDetailsURL, options);
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
    responseTransforms[provider as keyof typeof responseTransforms];

  if (!responseTransform) {
    responseTransform = responseTransforms['endpoints'];
  }

  outputURL = outputURL.replace('gs://', 'https://storage.googleapis.com/');
  const outputResponse = await fetch(`${outputURL}/predictions.jsonl`, options);

  const reader = outputResponse.body;

  if (!reader) {
    throw new Error('Failed to retrieve batch output');
  }

  const nodeStream = Stream.Readable.fromWeb(reader as NodeReadableStream);

  const responseStream = new Transform({
    transform(chunk, _, callback) {
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
        callback();
        return;
      }
      this.push(buffer + '\n');
      callback();
    },
  });

  const lineReader = createInterface({ input: nodeStream });

  lineReader.on('line', (line) => {
    responseStream.write(line);
  });

  lineReader.on('close', () => {
    responseStream.end();
  });

  return new Response(Stream.Readable.toWeb(responseStream) as ReadableStream, {
    headers: {
      'Content-Type': 'application/octet-stream',
    },
  });
};

export const BatchOutputResponseTransform = async (response: Response) => {
  return response;
};
