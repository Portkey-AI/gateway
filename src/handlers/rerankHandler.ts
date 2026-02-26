import { RouterError } from '../errors/RouterError';
import {
  constructConfigFromRequestHeaders,
  tryTargetsRecursively,
} from './handlerUtils';
import { Context } from 'hono';

/**
 * Handles the '/rerank' API request by selecting the appropriate provider(s) and making the request to them.
 *
 * Rerank takes a query and a list of documents, returning the documents ranked by relevance to the query.
 * Supported by: Cohere, Jina, Oracle GenAI
 *
 * @param {Context} c - The Cloudflare Worker context.
 * @returns {Promise<Response>} - The response from the provider.
 * @throws Will throw an error if no provider options can be determined or if the request to the provider(s) fails.
 * @throws Will throw an 500 error if the handler fails due to some reasons
 */
export async function rerankHandler(c: Context): Promise<Response> {
  try {
    let request = await c.req.json();
    let requestHeaders = Object.fromEntries(c.req.raw.headers);
    const camelCaseConfig = constructConfigFromRequestHeaders(requestHeaders);

    const tryTargetsResponse = await tryTargetsRecursively(
      c,
      camelCaseConfig,
      request,
      requestHeaders,
      'rerank',
      'POST',
      'config'
    );

    return tryTargetsResponse;
  } catch (err: any) {
    console.error('rerankHandler error: ', err);
    let statusCode = 500;
    let errorMessage = 'Something went wrong';

    if (err instanceof RouterError) {
      statusCode = 400;
      errorMessage = err.message;
    }

    return new Response(
      JSON.stringify({
        status: 'failure',
        message: errorMessage,
      }),
      {
        status: statusCode,
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  }
}
