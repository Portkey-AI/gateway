// routes/oauth.ts

import { Hono } from 'hono';

import { createLogger } from '../../shared/utils/logger';
import { OAuthGateway } from '../services/oauthGateway';

const logger = createLogger('oauth-routes');

type Env = {
  Bindings: {
    ALBUS_BASEPATH?: string;
  };
  Variables: {
    gateway: OAuthGateway;
    controlPlane?: any;
  };
};

const oauthRoutes = new Hono<Env>();

/**
 * Parse the body of the request to a URLSearchParams
 * @param c
 * @returns
 */
async function parseBodyToParams(c: any): Promise<URLSearchParams> {
  const contentType = c.req.header('Content-Type') || '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const body = await c.req.text();
    return new URLSearchParams(body);
  }
  if (contentType.includes('application/json')) {
    const json = await c.req.json();
    return new URLSearchParams(json as any);
  }
  return new URLSearchParams();
}

const jsonError = (
  c: any,
  status: number,
  error: string,
  error_description?: string
) =>
  c.json(
    { error, ...(error_description ? { error_description } : {}) },
    status
  );

/**
 * Middleware: attach a configured gateway to the context
 */
oauthRoutes.use('*', async (c, next) => {
  if (c.get('controlPlane')) {
    return c.json({ error: 'Not implemented' }, 501);
  }
  c.set('gateway', new OAuthGateway(c));
  await next();
});

const gw = (c: any) => c.get('gateway') as OAuthGateway;

/**
 * OAuth 2.1 Dynamic Client Registration
 * Registers new OAuth clients
 */
oauthRoutes.post('/register', async (c) => {
  try {
    const clientData = (await c.req.json()) as any;
    logger.debug('register client', { url: c.req.url, clientData });

    const result = await gw(c).registerClient(clientData);
    return c.json(result, 201);
  } catch (error) {
    logger.error('Failed to handle registration request', error);
    return jsonError(c, 500, 'server_error', 'Registration failed');
  }
});

/**
 * OAuth 2.1 Authorization Endpoint
 * Handles browser-based authorization flow
 */
oauthRoutes.get('/authorize', async (c) => {
  logger.debug('oauth/authorize GET', { url: c.req.url });
  return await gw(c).startAuthorization();
});

/**
 * OAuth 2.1 Authorization Endpoint (POST)
 * Handles consent form submission
 */
oauthRoutes.post('/authorize', async (c) => {
  return gw(c).completeAuthorization();
});

/**
 * OAuth 2.1 Token Endpoint Proxy
 * Forwards token requests to the control plane
 */
oauthRoutes.post('/token', async (c) => {
  try {
    const params = await parseBodyToParams(c);
    if (params.toString() === '') {
      return jsonError(c, 400, 'invalid_request', 'Unsupported content type');
    }

    const result = await gw(c).handleTokenRequest(params, c.req.raw.headers);

    if (result.error && result.error === 'invalid_grant') {
      return c.json(
        {
          error: 'unauthorized',
          error_description: result.error_description ?? 'invalid grant',
        },
        401,
        {
          'WWW-Authenticate': `Bearer realm="Portkey", error="invalid_token", error_description="${result.error_description ?? 'invalid grant'}"`,
        }
      );
    }

    return c.json(result, result.error ? 400 : 200);
  } catch (error) {
    logger.error('Failed to handle token request', error);
    return jsonError(c, 502, 'server_error', 'Token request failed');
  }
});

/**
 * OAuth 2.1 Token Introspection Endpoint Proxy
 * Forwards introspection requests to the control plane
 */
oauthRoutes.post('/introspect', async (c) => {
  try {
    const params = await parseBodyToParams(c);
    if (params.toString() === '') {
      return c.json({ active: false }, 400);
    }

    const token = params.get('token') || '';
    const token_type_hint = (params.get('token_type_hint') || '') as
      | 'refresh_token'
      | 'access_token'
      | '';

    const result = await gw(c).introspectToken(token, token_type_hint);
    return c.json(result, result.active ? 200 : 400);
  } catch (error) {
    logger.error('Failed to handle introspection request', error);
    return c.json({ active: false }, 502);
  }
});

/**
 * OAuth 2.1 Token Revocation
 * Revokes access tokens
 */
oauthRoutes.post('/revoke', async (c) => {
  try {
    const params = await parseBodyToParams(c);
    if (params.toString() === '') {
      return c.text('', 200);
    }

    const token = params.get('token') || '';
    const token_type_hint = params.get('token_type_hint') || '';
    const client_id = params.get('client_id') || '';
    const authHeader = c.req.header('Authorization');

    await gw(c).revokeToken(token, token_type_hint, client_id, authHeader);

    // Per RFC 7009, always return 200 OK
    return c.text('', 200);
  } catch (error) {
    logger.error('Failed to handle revocation request', error);
    // Per RFC 7009, errors should still return 200
    return c.text('', 200);
  }
});

/**
 * Handle OAuth callback from upstream servers
 * This receives the authorization code from upstream servers and redirects back to consent
 */
oauthRoutes.get('/upstream-callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');

  logger.debug('Received upstream OAuth callback', {
    hasCode: code,
    hasState: state,
    error,
    url: c.req.url,
  });

  if (!state) {
    return c.html('Invalid state in upstream callback', 400);
  }

  const result = await gw(c).completeUpstreamAuth();

  if (result.error) {
    return c.html(`
      <html>
        <head><title>Authorization Failed</title></head>
        <body>
          <h1>Authorization Failed</h1>
          <p>Error: ${result.error}</p>
          <p>${result.error_description || ''}</p>
          <script>
            // Notify parent window if in popup
            if (window.opener) {
              window.opener.postMessage({ 
                type: 'oauth-error', 
                error: '${result.error}' 
              }, '*');
            }
            setTimeout(() => window.close(), 3000);
          </script>
        </body>
      </html>
    `);
  }

  // Redirect back to consent form or close window
  return c.html(`
    <html>
      <head>
        <title>Authorization Complete</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: #f5f5f5;
          }
          .container {
            text-align: center;
            padding: 40px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          h1 { color: #22c55e; }
          p { color: #666; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✅ Authorization Complete</h1>
          <p>You have successfully authorized access to the upstream server.</p>
          <p>You can now close this window and return to approve the gateway access.</p>
        </div>
        <script>
          // Notify parent window if in popup
          if (window.opener) {
            window.opener.postMessage({ 
              type: 'oauth-complete',
              status: 'success' 
            }, '*');
            // Try to reload opener
            try {
              window.opener.location.reload();
            } catch (e) {}
          }
          
          // Auto-close after a delay
          setTimeout(() => {
            try {
              window.close();
            } catch (e) {
              // If can't close, at least we showed the message
            }
          }, 2000);
        </script>
      </body>
    </html>
  `);
});

export { oauthRoutes };
