import { Context } from 'hono';
import { env } from 'hono/adapter';
import { handleFeedback } from '../services/feedback';
import { logger } from '../apm';

export async function feedbackHandler(c: Context): Promise<Response> {
  let resp;
  try {
    resp = await handleFeedback(c, c.req.raw, env(c), 'external');
  } catch (err: any) {
    logger.error(`feedback error: `, err);
  }
  if (!resp) {
    return new Response(
      JSON.stringify({
        status: 'failure',
        message: 'Something went wrong',
      }),
      {
        status: 500,
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  }
  return resp;
}
