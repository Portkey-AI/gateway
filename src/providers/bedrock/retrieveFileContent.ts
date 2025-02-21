import { Context } from 'hono';
import { Options } from '../../types/requestBody';
import BedrockAPIConfig from './api';
import { getOctetStreamToOctetStreamTransformer } from '../../handlers/streamHandlerUtils';
import { BEDROCK } from '../../globals';

const getRowTransform = () => {
  return (row: Record<string, any>) => row;
};

export const BedrockRetrieveFileContentRequestHandler = async ({
  c,
  providerOptions,
  requestURL,
}: {
  c: Context;
  providerOptions: Options;
  requestURL: string;
}) => {
  try {
    // construct the base url and endpoint
    const baseURL = BedrockAPIConfig.getBaseURL({
      providerOptions,
      fn: 'retrieveFileContent',
      c,
      gatewayRequestURL: requestURL,
    });
    const endpoint = BedrockAPIConfig.getEndpoint({
      providerOptions,
      fn: 'retrieveFileContent',
      gatewayRequestURL: requestURL,
      c,
      gatewayRequestBodyJSON: {},
    });
    const url = `${baseURL}${endpoint}`;

    // generate the headers
    const headers = await BedrockAPIConfig.headers({
      c,
      providerOptions,
      fn: 'retrieveFileContent',
      transformedRequestBody: {},
      transformedRequestUrl: url,
      gatewayRequestBody: {},
    });

    // make the request
    const response = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        JSON.stringify({
          type: 'provider_error',
          code: response.status,
          param: null,
          message: 'bedrock error: ' + errorText,
        })
      );
    }

    // transform the streaming response to provider format
    let responseStream: ReadableStream;
    if (response?.body) {
      responseStream = response?.body?.pipeThrough(
        getOctetStreamToOctetStreamTransformer(getRowTransform())
      );
    } else {
      throw new Error(
        'Failed to parse and transform file content, please verify that the file is a valid jsonl file used for batching or fine-tuning'
      );
    }

    // return the response
    return new Response(responseStream, {
      headers: {
        'content-type': 'application/octet-stream',
      },
    });
  } catch (error: any) {
    let errorResponse;

    try {
      errorResponse = JSON.parse(error.message);
      errorResponse.provider = BEDROCK;
    } catch (_e) {
      errorResponse = {
        error: {
          message: error.message,
          type: null,
          param: null,
          code: 500,
        },
        provider: BEDROCK,
      };
    }
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
};

export const BedrockRetrieveFileContentResponseTransform = (response: any) => {
  return response;
};
