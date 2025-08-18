import { Hono } from 'hono';
import { createLogger } from '../utils/logger';
import { localOAuth, OAuthClient } from '../services/localOAuth';
import { OAuthGateway } from '../services/oauthGateway';
import { oauthMustacheRenderer } from '../utils/mustacheRenderer';

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

  try {
    const clientData = (await c.req.json()) as any;
    logger.debug('register client', clientData);

    if (controlPlaneUrl) {
      // Use control plane
      const gateway = new OAuthGateway(controlPlaneUrl);
      const result = await gateway.registerClient(clientData);
      return c.json(result, 201);
    } else {
      // Use local OAuth
      const result = await localOAuth.registerClient(clientData);
      return c.json(result, 201);
    }
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
  const scope = params.scope || 'mcp:*';
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

  // Validate client exists - OAuth 2.1 requires proper client validation
  const clientInfo = await localOAuth.getClient(clientId);
  if (!clientInfo) {
    logger.warn(`Authorization request for unknown client: ${clientId}`);

    // Per OAuth 2.1 spec, return invalid_client error
    // We can only redirect if we can't trust the redirect_uri, so we return an error page
    const errorHtml = oauthMustacheRenderer.renderInvalidClientError(clientId);
    return c.html(errorHtml, 400);
  }

  // Validate redirect_uri matches registered URIs
  if (
    clientInfo.redirect_uris &&
    clientInfo.redirect_uris.length > 0 &&
    !clientInfo.redirect_uris.includes(redirectUri)
  ) {
    logger.warn(
      `Invalid redirect_uri for client ${clientId}: ${redirectUri}. Registered URIs: ${clientInfo.redirect_uris.join(', ')}`
    );

    // Per OAuth 2.1, if redirect_uri is invalid, we cannot redirect back
    // Return error page instead
    const registeredUris = clientInfo.redirect_uris?.join(', ') || 'None';
    const errorHtml = oauthMustacheRenderer.renderInvalidRedirectError(
      redirectUri,
      registeredUris
    );
    return c.html(errorHtml, 400);
  }

  // Enhanced MCP OAuth consent screen
  const html = oauthMustacheRenderer.renderConsentForm({
    clientId,
    clientName: clientInfo.name,
    clientLogoUri: clientInfo.logo_uri,
    clientUri: clientInfo.client_uri,
    redirectUri,
    redirectUris: clientInfo.redirect_uris,
    state,
    scope,
    codeChallenge,
    codeChallengeMethod,
  });

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

  // Validate redirect_uri matches registered URIs
  if (
    client.redirect_uris &&
    client.redirect_uris.length > 0 &&
    !client.redirect_uris.includes(redirectUri)
  ) {
    logger.error(
      `Invalid redirect_uri for client ${clientId}: ${redirectUri}. Registered URIs: ${client.redirect_uris.join(', ')}`
    );
    const errorUrl = new URL(redirectUri);
    errorUrl.searchParams.set('error', 'invalid_request');
    errorUrl.searchParams.set('error_description', 'Invalid redirect_uri');
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
