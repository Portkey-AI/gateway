import { Context } from 'hono';
import CohereAPIConfig from './api';
import { Options } from '../../types/requestBody';
import { CohereGetFileResponse, CohereRetrieveBatchResponse } from './types';
import avro from 'avsc';
import { CohereEmbedResponseTransformBatch } from './embed';
import { COHERE } from '../../globals';
import { generateInvalidProviderResponseError } from '../utils';

export const CohereGetBatchOutputHandler = async ({
  c,
  providerOptions,
  requestURL,
}: {
  c: Context;
  providerOptions: Options;
  requestURL: string;
}) => {
  try {
    const baseURL = CohereAPIConfig.getBaseURL({
      providerOptions,
      fn: 'retrieveBatch',
      c,
    });
    const endpoint = CohereAPIConfig.getEndpoint({
      providerOptions,
      fn: 'retrieveBatch',
      gatewayRequestURL: requestURL.replace('/output', ''),
      c,
      gatewayRequestBodyJSON: {},
    });
    const headers = await CohereAPIConfig.headers({
      providerOptions,
      fn: 'retrieveBatch',
      c,
      transformedRequestUrl: baseURL + endpoint,
      transformedRequestBody: {},
    });
    const retrieveBatchResponse = await fetch(baseURL + endpoint, {
      method: 'GET',
      headers,
    });
    const batchDetails: CohereRetrieveBatchResponse =
      await retrieveBatchResponse.json();
    const outputFileId = batchDetails.output_dataset_id;
    const retrieveFileResponse = await fetch(
      `https://api.cohere.ai/v1/datasets/${outputFileId}`,
      {
        method: 'GET',
        headers,
      }
    );
    const retrieveFileResponseJson: CohereGetFileResponse =
      await retrieveFileResponse.json();
    if (!retrieveFileResponseJson.dataset.dataset_parts) {
      throw new Error('file not found');
    }

    const stream = new ReadableStream({
      start: async (controller) => {
        const fileParts = retrieveFileResponseJson.dataset.dataset_parts;
        for (const filePart of fileParts) {
          const filePartResponse = await fetch(filePart.url, {
            method: 'GET',
            headers,
          });
          const arrayBuffer = await filePartResponse.arrayBuffer();
          const buf = Buffer.from(arrayBuffer);
          const decoder = new avro.streams.BlockDecoder({
            parseHook: (schema) => {
              return avro.Type.forSchema(schema, { wrapUnions: true });
            },
          });
          const encoder = new TextEncoder();
          decoder.on('data', (data) => {
            controller.enqueue(
              encoder.encode(
                JSON.stringify(
                  CohereEmbedResponseTransformBatch(JSON.parse(data))
                )
              )
            );
            controller.enqueue(encoder.encode('\n'));
          });
          decoder.on('end', () => {
            controller.close();
          });
          decoder.end(buf);
        }
      },
    });
    return new Response(stream, {
      headers: { 'Content-Type': 'application/octet-stream' },
    });
  } catch (error) {
    return generateInvalidProviderResponseError({ error }, COHERE);
  }
};
