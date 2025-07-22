import { logger } from '../apm';
import { RouterError } from '../errors/RouterError';
import {
  constructConfigFromRequestHeaders,
  tryTargetsRecursively,
} from './handlerUtils';
import { Context } from 'hono';

/**
 * Handles the '/embeddings' API request by selecting the appropriate provider(s) and making the request to them.
 *
 * @param {Context} c - The Cloudflare Worker context.
 * @returns {Promise<Response>} - The response from the provider.
 * @throws Will throw an error if no provider options can be determined or if the request to the provider(s) fails.
 * @throws Will throw an 500 error if the handler fails due to some reasons
 */
export async function embeddingsHandler(c: Context): Promise<Response> {
  try {
    const embReq = c.get('embeddingsRequest');
    const request = embReq ? await embReq?.json() : await c.req.json();
    const headers = embReq ? await embReq?.headers : c.req.raw.headers;
    const requestHeaders = Object.fromEntries(headers);
    const camelCaseConfig = constructConfigFromRequestHeaders(requestHeaders);

    const tryTargetsResponse = await tryTargetsRecursively(
      c,
      camelCaseConfig,
      request,
      requestHeaders,
      'embed',
      'POST',
      'config'
    );

    return tryTargetsResponse;
  } catch (err: any) {
    logger.error('embeddingsHandler error: ', err);
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
