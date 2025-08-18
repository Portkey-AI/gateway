import { Hono } from 'hono';
import { createLogger } from '../utils/logger';
import { localOAuth } from '../services/localOAuth';
import { OAuthGateway } from '../services/oauthGateway';

const logger = createLogger('oauth-routes');

type Env = {
  Bindings: {
    ALBUS_BASEPATH?: string;
  };
};

const oauthRoutes = new Hono<Env>();

/**
 * OAuth 2.1 Token Endpoint Proxy
 * Forwards token requests to the control plane
 */
oauthRoutes.post('/token', async (c) => {
  const controlPlaneUrl = c.env.ALBUS_BASEPATH || process.env.ALBUS_BASEPATH;
  const gateway = new OAuthGateway(controlPlaneUrl);

  try {
    const contentType = c.req.header('Content-Type') || '';
    let params: URLSearchParams;

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const body = await c.req.text();
      params = new URLSearchParams(body);
    } else if (contentType.includes('application/json')) {
      const json = await c.req.json();
      params = new URLSearchParams(json);
    } else {
      return c.json(
        {
          error: 'invalid_request',
          error_description: 'Unsupported content type',
        },
        400
      );
    }

    const result = await gateway.handleTokenRequest(params);

    if (result.error) {
      return c.json(result, 400);
    }

    return c.json(result, 200);
  } catch (error) {
    logger.error('Failed to handle token request', error);
    return c.json(
      { error: 'server_error', error_description: 'Token request failed' },
      502
    );
  }
});

/**
 * OAuth 2.1 Token Introspection Endpoint Proxy
 * Forwards introspection requests to the control plane
 */
oauthRoutes.post('/introspect', async (c) => {
  const controlPlaneUrl = c.env.ALBUS_BASEPATH || process.env.ALBUS_BASEPATH;
  const gateway = new OAuthGateway(controlPlaneUrl);

  try {
    const contentType = c.req.header('Content-Type') || '';
    let token: string;

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const body = await c.req.text();
      const params = new URLSearchParams(body);
      token = params.get('token') || '';
    } else if (contentType.includes('application/json')) {
      const json = (await c.req.json()) as any;
      token = json.token || '';
    } else {
      return c.json({ active: false }, 400);
    }

    if (!token) {
      return c.json({ active: false }, 400);
    }

    const authHeader = c.req.header('Authorization');
    const result = await gateway.introspectToken(token, authHeader);
    return c.json(result, 200);
  } catch (error) {
    logger.error('Failed to handle introspection request', error);
    return c.json({ active: false }, 502);
  }
});

/**
 * OAuth 2.1 Dynamic Client Registration
 * Registers new OAuth clients
 */
oauthRoutes.post('/register', async (c) => {
  const controlPlaneUrl = c.env.ALBUS_BASEPATH || process.env.ALBUS_BASEPATH;
  const gateway = new OAuthGateway(controlPlaneUrl);

  try {
    const clientData = (await c.req.json()) as any;
    const result = await gateway.registerClient(clientData);
    return c.json(result, 201);
  } catch (error) {
    logger.error('Failed to handle registration request', error);
    return c.json(
      { error: 'server_error', error_description: 'Registration failed' },
      500
    );
  }
});

/**
 * OAuth 2.1 Authorization Endpoint
 * Handles browser-based authorization flow
 */
oauthRoutes.get('/authorize', async (c) => {
  const controlPlaneUrl = c.env.ALBUS_BASEPATH || process.env.ALBUS_BASEPATH;

  if (controlPlaneUrl) {
    // Redirect to control plane authorization
    const query = c.req.url.split('?')[1] || '';
    return c.redirect(`${controlPlaneUrl}/oauth/authorize?${query}`, 302);
  }

  // Local authorization - render a simple consent page
  const params = c.req.query();
  const clientId = params.client_id;
  const redirectUri = params.redirect_uri;
  const state = params.state;
  const scope = params.scope || 'mcp:servers:read';
  const codeChallenge = params.code_challenge;
  const codeChallengeMethod = params.code_challenge_method;

  // Log authorization attempts to debug multiple windows
  logger.info('Authorization attempt:', {
    client_id: clientId,
    redirect_uri: redirectUri,
    state: state,
    code_challenge: codeChallenge ? 'present' : 'missing',
    user_agent: c.req.header('User-Agent'),
  });

  if (!clientId || !redirectUri) {
    return c.text(
      'Missing required parameters: client_id and redirect_uri',
      400
    );
  }

  // Check if client exists, if not, dynamically register it
  let clientInfo = await localOAuth.getClient(clientId);
  if (!clientInfo) {
    logger.info(
      `Client ${clientId} not found, performing dynamic registration`
    );

    // Extract client name from the client_id or redirect_uri
    const clientName = redirectUri.includes('cursor')
      ? 'Cursor'
      : redirectUri.includes('vscode')
        ? 'VS Code'
        : 'MCP Client';

    // Directly create the client with the requested client_id
    await localOAuth.createClientWithId(clientId, {
      client_name: clientName,
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code'],
      token_endpoint_auth_method: 'none', // Public client with PKCE
      scope: scope || 'mcp:servers:read',
    });

    clientInfo = await localOAuth.getClient(clientId);
    logger.info(`Dynamically registered client: ${clientId} as ${clientName}`);
  }

  // Validate redirect_uri if client has registered URIs
  if (
    clientInfo &&
    clientInfo.redirect_uris &&
    clientInfo.redirect_uris.length > 0
  ) {
    if (!clientInfo.redirect_uris.includes(redirectUri)) {
      // For dynamic clients, add the new redirect_uri
      logger.info(
        `Adding new redirect_uri for client ${clientId}: ${redirectUri}`
      );
      await localOAuth.addRedirectUri(clientId, redirectUri);
    }
  }

  // In a real implementation, you'd show a consent screen here
  // For local dev, we'll auto-approve
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Authorize MCP Access</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 40px; max-width: 600px; margin: 0 auto; }
        h1 { color: #333; }
        .scope-list { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .scope-item { margin: 10px 0; }
        .buttons { margin-top: 30px; }
        button { padding: 10px 20px; margin-right: 10px; font-size: 16px; border-radius: 4px; border: none; cursor: pointer; }
        .approve { background: #0066cc; color: white; }
        .deny { background: #e0e0e0; color: #333; }
      </style>
    </head>
    <body>
      <h1>Authorize MCP Access</h1>
      <p><strong>${clientId}</strong> is requesting access to your MCP Gateway resources:</p>
      <div class="scope-list">
        <div class="scope-item">📋 Requested permissions: <code>${scope}</code></div>
      </div>
      <form method="post" action="/oauth/authorize">
        <input type="hidden" name="client_id" value="${clientId}">
        <input type="hidden" name="redirect_uri" value="${redirectUri}">
        <input type="hidden" name="state" value="${state || ''}">
        <input type="hidden" name="scope" value="${scope}">
        ${codeChallenge ? `<input type="hidden" name="code_challenge" value="${codeChallenge}">` : ''}
        ${codeChallengeMethod ? `<input type="hidden" name="code_challenge_method" value="${codeChallengeMethod}">` : ''}
        <div class="buttons">
          <button type="submit" name="action" value="approve" class="approve">Approve</button>
          <button type="submit" name="action" value="deny" class="deny">Deny</button>
        </div>
      </form>
    </body>
    </html>
  `;

  return c.html(html);
});

/**
 * OAuth 2.1 Authorization Endpoint (POST)
 * Handles consent form submission
 */
oauthRoutes.post('/authorize', async (c) => {
  console.log('oauth/authorize POST');
  const controlPlaneUrl = c.env.ALBUS_BASEPATH || process.env.ALBUS_BASEPATH;

  if (controlPlaneUrl) {
    // Forward to control plane
    const body = await c.req.text();
    const response = await fetch(`${controlPlaneUrl}/oauth/authorize`, {
      method: 'POST',
      headers: {
        'Content-Type': c.req.header('Content-Type') || '',
        'User-Agent': 'Portkey-MCP-Gateway/0.1.0',
      },
      body,
    });

    // Follow redirects
    if (response.status === 302 || response.status === 303) {
      const location = response.headers.get('Location');
      if (location) {
        return c.redirect(location, response.status as any);
      }
    }

    const responseData = await response.text();
    return c.text(responseData, response.status as any);
  }

  // Local authorization handling
  const formData = await c.req.formData();
  const action = formData.get('action');
  const clientId = formData.get('client_id') as string;
  const redirectUri = formData.get('redirect_uri') as string;
  const state = formData.get('state') as string;
  const scope = (formData.get('scope') as string) || 'mcp:servers:read';
  const codeChallenge = formData.get('code_challenge') as string;
  const codeChallengeMethod = formData.get('code_challenge_method') as string;

  if (action === 'deny') {
    // User denied access
    const denyUrl = new URL(redirectUri);
    denyUrl.searchParams.set('error', 'access_denied');
    if (state) denyUrl.searchParams.set('state', state);
    return c.redirect(denyUrl.toString(), 302);
  }

  // Validate client exists before creating authorization code
  const client = await localOAuth.getClient(clientId);
  if (!client) {
    logger.error(
      `Attempt to create authorization code for non-existent client: ${clientId}`
    );
    const errorUrl = new URL(redirectUri);
    errorUrl.searchParams.set('error', 'invalid_client');
    errorUrl.searchParams.set('error_description', 'Client not found');
    if (state) errorUrl.searchParams.set('state', state);
    return c.redirect(errorUrl.toString(), 302);
  }

  // User approved - create authorization code
  const code = localOAuth.createAuthorizationCode({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
  });

  // Redirect back with code
  const approveUrl = new URL(redirectUri);
  approveUrl.searchParams.set('code', code);
  if (state) approveUrl.searchParams.set('state', state);

  console.log('approveUrl', approveUrl.toString());

  return c.redirect(approveUrl.toString(), 302);
});

/**
 * OAuth 2.1 Token Revocation
 * Revokes access tokens
 */
oauthRoutes.post('/revoke', async (c) => {
  const controlPlaneUrl = c.env.ALBUS_BASEPATH || process.env.ALBUS_BASEPATH;
  const gateway = new OAuthGateway(controlPlaneUrl);

  try {
    const contentType = c.req.header('Content-Type') || '';
    let token: string;

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const body = await c.req.text();
      const params = new URLSearchParams(body);
      token = params.get('token') || '';
    } else {
      return c.json({ error: 'unsupported_token_type' }, 400);
    }

    const authHeader = c.req.header('Authorization');
    await gateway.revokeToken(token, authHeader);

    // Per RFC 7009, always return 200 OK
    return c.text('', 200);
  } catch (error) {
    logger.error('Failed to handle revocation request', error);
    // Per RFC 7009, errors should still return 200
    return c.text('', 200);
  }
});

export { oauthRoutes };
