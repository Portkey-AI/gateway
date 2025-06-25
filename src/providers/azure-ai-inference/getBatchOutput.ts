import { Context } from 'hono';
import AzureAIInferenceAPI from './api';
import { Options } from '../../types/requestBody';
import { RetrieveBatchResponse } from '../types';
import { AZURE_OPEN_AI } from '../../globals';

// Return a ReadableStream containing batches output data
export const AzureAIInferenceGetBatchOutputRequestHandler = async ({
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
  const baseUrl = AzureAIInferenceAPI.getBaseURL({
    providerOptions,
    fn: 'retrieveBatch',
    c,
    gatewayRequestURL: requestURL,
  });
  const retrieveBatchRequestURL = requestURL.replace('/output', '');
  const retrieveBatchURL =
    baseUrl +
    AzureAIInferenceAPI.getEndpoint({
      providerOptions,
      fn: 'retrieveBatch',
      gatewayRequestURL: retrieveBatchRequestURL,
      c,
      gatewayRequestBodyJSON: {},
      gatewayRequestBody: {},
    });
  const retrieveBatchesHeaders = await AzureAIInferenceAPI.headers({
    c,
    providerOptions,
    fn: 'retrieveBatch',
    transformedRequestBody: {},
    transformedRequestUrl: retrieveBatchURL,
    gatewayRequestBody: {},
  });
  try {
    const retrieveBatchesResponse = await fetch(retrieveBatchURL, {
      method: 'GET',
      headers: retrieveBatchesHeaders,
    });

    if (!retrieveBatchesResponse.ok) {
      const error = await retrieveBatchesResponse.text();
      return new Response(
        JSON.stringify({
          error: error || 'error fetching batch output',
          provider: AZURE_OPEN_AI,
          param: null,
        }),
        {
          status: 500,
        }
      );
    }

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
          provider: AZURE_OPEN_AI,
        }),
        {
          status: 400,
        }
      );
    }
    const retrieveFileContentRequestURL = `https://api.portkey.ai/v1/files/${outputFileId}/content`; // construct the entire url instead of the path of sanity sake
    const retrieveFileContentURL =
      baseUrl +
      AzureAIInferenceAPI.getEndpoint({
        providerOptions,
        fn: 'retrieveFileContent',
        gatewayRequestURL: retrieveFileContentRequestURL,
        c,
        gatewayRequestBodyJSON: {},
        gatewayRequestBody: {},
      });
    const retrieveFileContentHeaders = await AzureAIInferenceAPI.headers({
      c,
      providerOptions,
      fn: 'retrieveFileContent',
      transformedRequestBody: {},
      transformedRequestUrl: retrieveFileContentURL,
      gatewayRequestBody: {},
    });
    const response = fetch(retrieveFileContentURL, {
      method: 'GET',
      headers: retrieveFileContentHeaders,
    });
    return response;
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: 'error fetching batch output',
        provider: AZURE_OPEN_AI,
        param: null,
      }),
      {
        status: 500,
      }
    );
  }
};
