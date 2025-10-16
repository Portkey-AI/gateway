import { Context, Hono } from 'hono';
import { getDefaultCache } from '../shared/services/cache';
import { getSettings } from '../../initializeSettings';
import { generateRateLimitKey } from '../middlewares/portkey/handlers/rateLimits';
import { RateLimiterKeyTypes } from '../globals';

/**
 * Helper function to authenticate admin requests
 */
async function authenticateAdmin(c: Context): Promise<boolean> {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const settingsPath = path.join(process.cwd(), 'conf.json');
    const settingsData = await fs.readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(settingsData);

    const authHeader =
      c.req.header('Authorization') || c.req.header('authorization');
    const providedKey =
      authHeader?.replace('Bearer ', '') || c.req.header('x-admin-api-key');

    return providedKey === settings.adminApiKey;
  } catch (error) {
    console.error('Error authenticating admin:', error);
    return false;
  }
}

/**
 * GET route for /admin/settings
 * Serves the settings configuration file (requires admin authentication)
 */
async function getSettingsHandler(c: Context): Promise<Response> {
  const isAuthenticated = await authenticateAdmin(c);
  if (!isAuthenticated) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const settingsPath = path.join(process.cwd(), 'conf.json');
    const settingsData = await fs.readFile(settingsPath, 'utf-8');
    return c.json(JSON.parse(settingsData));
  } catch (error) {
    console.error('Error reading conf.json:', error);
    return c.json({ error: 'Settings file not found' }, 404);
  }
}

/**
 * PUT route for /admin/settings
 * Updates the settings configuration file (requires admin authentication)
 */
async function putSettingsHandler(c: Context): Promise<Response> {
  const isAuthenticated = await authenticateAdmin(c);
  if (!isAuthenticated) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const settingsPath = path.join(process.cwd(), 'conf.json');
    const body = await c.req.json();
    await fs.writeFile(settingsPath, JSON.stringify(body, null, 2));
    return c.json({ success: true });
  } catch (error) {
    console.error('Error writing conf.json:', error);
    return c.json({ error: 'Failed to save settings' }, 500);
  }
}

async function resetIntegrationRateLimitHandler(c: Context): Promise<Response> {
  const isAuthenticated = await authenticateAdmin(c);
  if (!isAuthenticated) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const settings = await getSettings();
    const integrationId = c.req.param('integrationId');
    const organisationId = settings.organisationDetails.id;
    const workspaceId = settings.organisationDetails?.workspaceDetails?.id;
    const rateLimits = settings.integrations.find(
      (integration) => integration.slug === integrationId
    )?.integration_details?.rate_limits;
    const workspaceKey = `${integrationId}-${workspaceId}`;
    for (const rateLimit of rateLimits) {
      const rateLimitKey = generateRateLimitKey(
        organisationId,
        rateLimit.type,
        RateLimiterKeyTypes.INTEGRATION_WORKSPACE,
        workspaceKey,
        rateLimit.unit
      );
      const finalKey = `{rate:${rateLimitKey}}:${rateLimit.type}`;
      const cache = getDefaultCache();
      await cache.delete(finalKey);
    }
    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting cache:', error);
    return c.json({ error: 'Failed to delete cache' }, 500);
  }
}

/**
 * Admin routes handler
 * Handles all /admin/* routes
 */
export function adminRoutesHandler() {
  const adminApp = new Hono();

  // Settings routes
  adminApp.get('/settings', getSettingsHandler);
  adminApp.put('/settings', putSettingsHandler);
  adminApp.put(
    '/integrations/ratelimit/:integrationId/reset',
    resetIntegrationRateLimitHandler
  );

  // Add more admin routes here as needed
  // adminApp.get('/users', getUsersHandler);
  // adminApp.post('/users', createUserHandler);
  // etc.

  return adminApp;
}
