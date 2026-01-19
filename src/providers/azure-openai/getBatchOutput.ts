import { Context } from 'hono';
import AzureOpenAIAPIConfig from './api';
import { Options } from '../../types/requestBody';
import { RetrieveBatchResponse } from '../types';
import { AZURE_OPEN_AI } from '../../globals';
import { generateErrorResponse } from '../utils';

// Return a ReadableStream containing batches output data
export const AzureOpenAIGetBatchOutputRequestHandler = async ({
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
  const baseUrl = AzureOpenAIAPIConfig.getBaseURL({
    providerOptions,
    fn: 'retrieveBatch',
    c,
    gatewayRequestURL: requestURL,
  });
  const retrieveBatchRequestURL = requestURL.replace('/output', '');
  const retrieveBatchURL =
    baseUrl +
    AzureOpenAIAPIConfig.getEndpoint({
      providerOptions,
      fn: 'retrieveBatch',
      gatewayRequestURL: retrieveBatchRequestURL,
      c,
      gatewayRequestBodyJSON: {},
      gatewayRequestBody: {},
    });
  const retrieveBatchesHeaders = await AzureOpenAIAPIConfig.headers({
    c,
    providerOptions,
    fn: 'retrieveBatch',
    transformedRequestBody: {},
    transformedRequestUrl: retrieveBatchURL,
    gatewayRequestBody: {},
  });
  const retrieveBatchesResponse = await fetch(retrieveBatchURL, {
    method: 'GET',
    headers: retrieveBatchesHeaders,
  });

  const batchDetails: RetrieveBatchResponse =
    await retrieveBatchesResponse.json();

  const outputFileId =
    batchDetails.output_file_id || batchDetails.error_file_id;
  const outputBlob = batchDetails.output_blob || batchDetails.error_blob;
  if (!outputFileId && !outputBlob) {
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
        provider: AZURE_OPEN_AI,
      }),
      {
        status: 400,
      }
    );
  }
  let response: Promise<Response> | null = null;
  if (outputFileId) {
    const retrieveFileContentRequestURL = `https://api.portkey.ai/v1/files/${outputFileId}/content`; // construct the entire url instead of the path of sanity sake
    const retrieveFileContentURL =
      baseUrl +
      AzureOpenAIAPIConfig.getEndpoint({
        providerOptions,
        fn: 'retrieveFileContent',
        gatewayRequestURL: retrieveFileContentRequestURL,
        c,
        gatewayRequestBodyJSON: {},
        gatewayRequestBody: {},
      });
    const retrieveFileContentHeaders = await AzureOpenAIAPIConfig.headers({
      c,
      providerOptions,
      fn: 'retrieveFileContent',
      transformedRequestBody: {},
      transformedRequestUrl: retrieveFileContentURL,
      gatewayRequestBody: {},
    });
    response = fetch(retrieveFileContentURL, {
      method: 'GET',
      headers: retrieveFileContentHeaders,
    });
  }
  if (outputBlob) {
    const retrieveBlobHeaders = await AzureOpenAIAPIConfig.headers({
      c,
      providerOptions: {
        ...providerOptions,
        azureEntraScope: 'https://storage.azure.com/.default',
      },
      fn: 'retrieveFileContent',
      transformedRequestBody: {},
      transformedRequestUrl: outputBlob,
      gatewayRequestBody: {},
    });
    response = fetch(outputBlob, {
      method: 'GET',
      headers: {
        ...retrieveBlobHeaders,
        'x-ms-date': new Date().toUTCString(),
        'x-ms-version': '2022-11-02',
      },
    });
  }
  const responseData = await response;
  if (!responseData || !responseData.ok) {
    const errorResponse = (await responseData?.text()) || 'no output found';
    return new Response(
      JSON.stringify(
        generateErrorResponse(
          {
            message: errorResponse,
            type: null,
            param: null,
            code: null,
          },
          AZURE_OPEN_AI
        )
      ),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
  return responseData;
};
