import { Context } from 'hono';
import { Options } from '../../types/requestBody';
import BedrockAPIConfig from './api';

export const BedrockRetrieveFileRequestHandler = async ({
  c,
  providerOptions,
  requestURL,
}: {
  c: Context;
  providerOptions: Options;
  requestURL: string;
}) => {
  const baseUrl = await BedrockAPIConfig.getBaseURL({
    providerOptions,
    fn: 'retrieveFile',
  });
  const retrieveFileURL = `${baseUrl}/${requestURL.split('/v1/files/')[1]}?attributes`;
  const headers = await BedrockAPIConfig.headers({
    c,
    providerOptions,
    fn: 'retrieveFile',
    transformedRequestBody: {},
    transformedRequestUrl: retrieveFileURL,
  });
  const response = await fetch(retrieveFileURL, {
    method: 'GET',
    headers,
  });
  const responseBodyXML = await response.text();
  const responseHeaders = response.headers;
  try {
    const match = responseBodyXML.match(/<ObjectSize>(\d+)<\/ObjectSize>/);
    const size = match?.[1];
    const transformedResponse = {
      object: 'file',
      id: requestURL.split('/v1/files/')[1],
      purpose: '',
      filename: requestURL.split('/v1/files/')[1],
      bytes: size,
      createdAt: Math.floor(
        new Date(responseHeaders.get('last-modified') || '').getTime() / 1000
      ),
      status: 'processed',
      status_details: null,
    };
    return new Response(JSON.stringify(transformedResponse), {
      headers: {
        'content-type': 'application/json',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to retrieve file',
      }),
      {
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  }
};
