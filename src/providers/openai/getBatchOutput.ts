import { Context } from 'hono';
import OpenAIAPIConfig from './api';
import { Options } from '../../types/requestBody';
import { RetrieveBatchResponse } from '../types';
import { OPEN_AI } from '../../globals';
import {
  externalServiceFetch,
  externalServiceFetchWithNodeFetch,
} from '../../utils/fetch';
import { Readable } from 'stream';
import { getRuntimeKey } from 'hono/adapter';

const runtime = getRuntimeKey();

// Return a ReadableStream containing batches output data
export const OpenAIGetBatchOutputRequestHandler = async ({
  c,
  providerOptions,
  requestURL,
}: {
  c: Context;
  providerOptions: Options;
  requestURL: string;
}) => {
  // get batch details which has ouptut file id
  // get file content as ReadableStream
  // return file content
  const baseUrl = OpenAIAPIConfig.getBaseURL({
    providerOptions,
    fn: 'retrieveBatch',
    c,
    gatewayRequestURL: requestURL,
  });
  const batchId = requestURL.split('/v1/batches/')[1].replace('/output', '');
  const retrieveBatchURL = `${baseUrl}/batches/${batchId}`;
  const retrieveBatchesHeaders = await OpenAIAPIConfig.headers({
    c,
    providerOptions,
    fn: 'retrieveBatch',
    transformedRequestBody: {},
    transformedRequestUrl: retrieveBatchURL,
    gatewayRequestBody: {},
  });
  const retrieveBatchesResponse = await externalServiceFetch(retrieveBatchURL, {
    method: 'GET',
    headers: retrieveBatchesHeaders,
  });

  const batchDetails: RetrieveBatchResponse =
    await retrieveBatchesResponse.json();
  const outputFileId =
    batchDetails.output_file_id || batchDetails.error_file_id;
  if (!outputFileId) {
    const errors = batchDetails.errors;
    if (errors) {
      return new Response(JSON.stringify(errors), {
        status: 200,
      });
    }
    return new Response(
      JSON.stringify({
        error: 'invalid response output format',
        provider_response: batchDetails,
        provider: OPEN_AI,
      }),
      {
        status: 400,
      }
    );
  }
  const retrieveFileContentURL = `${baseUrl}/files/${outputFileId}/content`;
  const retrieveFileContentHeaders = await OpenAIAPIConfig.headers({
    c,
    providerOptions,
    fn: 'retrieveFileContent',
    transformedRequestBody: {},
    transformedRequestUrl: retrieveFileContentURL,
    gatewayRequestBody: {},
  });
  const response = await externalServiceFetchWithNodeFetch(
    retrieveFileContentURL,
    {
      method: 'GET',
      headers: retrieveFileContentHeaders,
    }
  );
  const responseBody =
    runtime === 'node'
      ? Readable.toWeb(response.body as Readable) // WebStream in worker env.
      : response.body;
  return new Response(responseBody as any, {
    headers: { 'Content-Type': 'application/octet-stream' },
  });
};

export const BatchOutputResponseTransform = async (response: Response) => {
  return response;
};
