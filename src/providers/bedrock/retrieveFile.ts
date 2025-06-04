import { Context } from 'hono';
import { Options } from '../../types/requestBody';
import BedrockAPIConfig from './api';
import { BEDROCK } from '../../globals';

export const BedrockRetrieveFileRequestHandler = async ({
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
    const baseUrl = await BedrockAPIConfig.getBaseURL({
      providerOptions,
      fn: 'retrieveFile',
      c,
      gatewayRequestURL: requestURL,
    });
    const endpoint = BedrockAPIConfig.getEndpoint({
      c,
      providerOptions,
      fn: 'retrieveFile',
      gatewayRequestURL: requestURL,
      gatewayRequestBodyJSON: {},
    });
    const retrieveFileURL = `${baseUrl}${endpoint}`;

    // generate the headers
    const headers = await BedrockAPIConfig.headers({
      c,
      providerOptions,
      fn: 'retrieveFile',
      transformedRequestBody: {},
      transformedRequestUrl: retrieveFileURL,
    });

    // make the request
    const response = await fetch(retrieveFileURL, {
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

    // parse necessary information from xml response
    const responseBodyXML = await response.text();
    const responseHeaders = response.headers;
    const match = responseBodyXML.match(/<ObjectSize>(\d+)<\/ObjectSize>/);
    const size = match?.[1];

    // transform the response
    const transformedResponse = {
      object: 'file',
      id: requestURL.split('/v1/files/')[1],
      purpose: '',
      filename: decodeURIComponent(requestURL.split('/v1/files/')[1]),
      bytes: size,
      createdAt: Math.floor(
        new Date(responseHeaders.get('last-modified') || '').getTime() / 1000
      ),
      status: 'processed',
      status_details: null,
    };

    // return the response
    return new Response(JSON.stringify(transformedResponse), {
      headers: {
        'content-type': 'application/json',
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
