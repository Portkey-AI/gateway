import { Context, Next } from 'hono';
import conf from '../../../conf.json';

const SESSION_COOKIE_NAME = 'portkey_admin_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours
const adminSessions = new Map<string, number>();

const getConfiguredAdminToken = (): string => {
  const adminToken = (conf as Record<string, unknown>)?.admin_token;
  if (
    !adminToken ||
    typeof adminToken !== 'string' ||
    adminToken.trim() === ''
  ) {
    throw new Error(
      'Admin UI auth requires conf.json.admin_token. Set admin_token or start the gateway with --headless.'
    );
  }
  return adminToken;
};

const parseCookies = (cookieHeader?: string): Record<string, string> => {
  if (!cookieHeader) return {};

  return cookieHeader.split(';').reduce(
    (acc, cookiePart) => {
      const [rawKey, ...valueParts] = cookiePart.trim().split('=');
      if (!rawKey) return acc;
      acc[rawKey] = decodeURIComponent(valueParts.join('='));
      return acc;
    },
    {} as Record<string, string>
  );
};

const getSessionId = (c: Context): string | undefined => {
  const cookies = parseCookies(c.req.header('cookie'));
  return cookies[SESSION_COOKIE_NAME];
};

const getBearerToken = (c: Context): string | undefined => {
  const authHeader = c.req.header('authorization');
  if (!authHeader) return undefined;

  const [scheme, token] = authHeader.trim().split(/\s+/, 2);
  if (!scheme || !token) return undefined;
  if (scheme.toLowerCase() !== 'bearer') return undefined;

  return token;
};

const isSessionActive = (sessionId?: string): boolean => {
  if (!sessionId) return false;

  const expiresAt = adminSessions.get(sessionId);
  if (!expiresAt) return false;

  if (expiresAt < Date.now()) {
    adminSessions.delete(sessionId);
    return false;
  }

  return true;
};

const createSession = (): string => {
  const sessionId = crypto.randomUUID();
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  adminSessions.set(sessionId, expiresAt);
  return sessionId;
};

const setSessionCookie = (c: Context, sessionId: string) => {
  c.header(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}`
  );
};

export const adminAuthMiddleware = async (c: Context, next: Next) => {
  let configuredToken: string;
  try {
    configuredToken = getConfiguredAdminToken();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Admin UI auth is misconfigured.';
    return c.json({ status: 'failure', message }, 500);
  }

  const hasValidSession = isSessionActive(getSessionId(c));
  const hasValidBearerToken = getBearerToken(c) === configuredToken;

  if (!hasValidSession && !hasValidBearerToken) {
    return c.json(
      {
        status: 'failure',
        message:
          'Admin authentication required. Use a valid admin session cookie or Authorization: Bearer <admin_token>.',
      },
      401
    );
  }

  await next();
};

export const adminAuthSessionStatusHandler = (c: Context) => {
  try {
    getConfiguredAdminToken();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Admin UI auth is misconfigured.';
    return c.json({ status: 'failure', message }, 500);
  }

  return c.json({ authenticated: isSessionActive(getSessionId(c)) });
};

export const adminAuthLoginHandler = async (c: Context) => {
  let configuredToken: string;
  try {
    configuredToken = getConfiguredAdminToken();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Admin UI auth is misconfigured.';
    return c.json({ status: 'failure', message }, 500);
  }

  let body: { admin_token?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      {
        status: 'failure',
        message: 'Invalid request body. Expected JSON with admin_token.',
      },
      400
    );
  }

  if (!body.admin_token || body.admin_token !== configuredToken) {
    return c.json(
      {
        status: 'failure',
        message: 'Invalid admin token.',
      },
      401
    );
  }

  const sessionId = createSession();
  setSessionCookie(c, sessionId);
  return c.json({ authenticated: true });
};
