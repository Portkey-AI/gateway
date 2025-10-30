import { Context } from 'hono';

export function getBaseUrl(c: Context): URL {
  const baseUrl = new URL(c.req.url);
  if (c.req.header('x-forwarded-proto') === 'https') {
    baseUrl.protocol = 'https';
  }
  return baseUrl;
}
