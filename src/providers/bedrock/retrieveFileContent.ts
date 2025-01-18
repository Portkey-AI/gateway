import { Context } from 'hono';
import { Options } from '../../types/requestBody';
import BedrockAPIConfig from './api';
import { getOctetStreamToOctetStreamTransformer } from '../../handlers/streamHandlerUtils';

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
    const baseURL = BedrockAPIConfig.getBaseURL({
      providerOptions,
      fn: 'retrieveFileContent',
      c,
    });
    const endpoint = BedrockAPIConfig.getEndpoint({
      providerOptions,
      fn: 'retrieveFileContent',
      gatewayRequestURL: requestURL,
      c,
      gatewayRequestBodyJSON: {},
    });
    const headers = await BedrockAPIConfig.headers({
      c,
      providerOptions,
      fn: 'retrieveFileContent',
      transformedRequestBody: {},
      transformedRequestUrl: baseURL + endpoint,
      gatewayRequestBody: {},
    });
    const response = await fetch(baseURL + endpoint, {
      method: 'GET',
      headers,
    });
    let responseStream: ReadableStream;
    if (
      response.headers.get('content-type')?.includes('octet-stream') &&
      response?.body
    ) {
      responseStream = response?.body?.pipeThrough(
        getOctetStreamToOctetStreamTransformer(getRowTransform())
      );
    } else {
      throw new Error('Failed to retrieve file content');
    }
    return new Response(responseStream, {
      headers: {
        'content-type': 'application/octet-stream',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to retrieve file content',
        details: error,
      }),
      {
        status: 500,
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  }
};

export const BedrockRetrieveFileContentResponseTransform = async ({
  response,
}: {
  response: Response;
}) => {
  return response;
};
