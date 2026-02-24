import { Context, Next } from 'hono';
import { Environment } from '../../utils/env';
import { env } from 'hono/adapter';

/**
 * Service Authentication Middleware
 *
 * Validates that the Authorization header matches PORTKEY_CLIENT_AUTH.
 * Used for internal service-to-service authentication.
 */
export async function serviceAuthMiddleware(
  c: Context,
  next: Next
): Promise<Response | void> {
  const cfEnv = env(c);
  const expectedAuth = Environment(cfEnv).PORTKEY_CLIENT_AUTH;

  if (!expectedAuth) {
    return c.json(
      { error: 'Service authentication not configured' },
      { status: 500 }
    );
  }

  const authHeader = c.req.header('Authorization');

  if (!authHeader) {
    return c.json({ error: 'Authorization header required' }, { status: 401 });
  }

  if (authHeader !== expectedAuth) {
    return c.json({ error: 'Invalid service credentials' }, { status: 403 });
  }

  await next();
}
