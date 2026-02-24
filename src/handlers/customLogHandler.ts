import { Context } from 'hono';
import { uploadToLogStore } from '../services/winky';
import { env } from 'hono/adapter';
import { logger } from '../apm';
import { PORTKEY_HEADER_KEYS } from '../middlewares/portkey/globals';

export async function customLogHandler(c: Context): Promise<Response> {
  try {
    const requestBody = c.get('requestBodyData').bodyJSON;
    const requestHeaders = c.get('mappedHeaders');
    const overrideLogUsage =
      requestHeaders[PORTKEY_HEADER_KEYS.OVERRIDE_SERVICE_LOG_USAGE] === 'true';
    return uploadToLogStore(
      requestBody,
      'generations',
      false,
      env(c),
      {
        headers: new Headers(requestHeaders),
        method: c.req.method,
        url: c.req.url,
      },
      overrideLogUsage
    );
  } catch (err: any) {
    logger.error(`customLogHandler error: `, err);
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
}
