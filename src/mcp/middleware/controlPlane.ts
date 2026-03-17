/**
 * MCP Gateway Control Plane Client
 * API client for communicating with the StringCost control plane
 */

import crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { getCache } from '../utils/cache.js';
import { ENV_VARS, ERROR_MESSAGES, TIMEOUTS } from '../constants/index.js';
import { generateTokenCacheKey, normalizeServerUrl } from '../services/oauthState.js';
import type {
  ServerConfig,
  ServerTokens,
  ToolkitConfig,
  TransportType,
  AuthType,
} from '../types/index.js';

const log = logger.child('controlPlane');

interface ControlPlaneConfig {
  url: string;
  apiKey: string;
}

// Check if we're in mock mode (no control plane configured)
const isMockMode = process.env.MCP_MOCK_MODE === 'true' ||
  (!process.env[ENV_VARS.CONTROL_PLANE_URL] && !process.env[ENV_VARS.CONTROL_PLANE_API_KEY]);

function getConfig(): ControlPlaneConfig {
  if (isMockMode) {
    return { url: 'mock://localhost', apiKey: 'mock-api-key' };
  }

  const url = process.env[ENV_VARS.CONTROL_PLANE_URL];
  const apiKey = process.env[ENV_VARS.CONTROL_PLANE_API_KEY];

  if (!url) {
    throw new Error('CONTROL_PLANE_URL environment variable is required');
  }
  if (!apiKey) {
    throw new Error('CONTROL_PLANE_API_KEY environment variable is required');
  }

  return { url: url.replace(/\/$/, ''), apiKey };
}

interface RawServerConfig {
  id: string;
  api_client_id: string;
  server_label: string;
  server_url: string;
  auth_type: string;
  auth_config: Record<string, unknown>;
  transport: string;
  tool_schema: any;
  tool_schema_updated_at: string | null;
  is_active: boolean;
}

interface RawToolkitConfig {
  id: string;
  api_client_id: string;
  name: string;
  description: string | null;
  allowed_tools: string[] | null;
  blocked_tools: string[] | null;
  mcp_server_ids: string[] | null;
  metadata: Record<string, unknown>;
  is_active: boolean;
}

function transformServerConfig(raw: RawServerConfig, workspaceId: string): ServerConfig {
  return {
    id: raw.id,
    serverId: raw.id,
    workspaceId,
    serverLabel: raw.server_label,
    url: raw.server_url,
    transport: {
      preferred: (raw.transport === 'streamable-http' ? 'http' : raw.transport || 'sse') as TransportType,
      allowFallback: true,
    },
    authType: (raw.auth_type || 'none') as AuthType,
    authConfig: raw.auth_config || {},
    isActive: raw.is_active,
    toolSchema: raw.tool_schema,
    toolSchemaUpdatedAt: raw.tool_schema_updated_at
      ? new Date(raw.tool_schema_updated_at)
      : undefined,
  };
}

function transformToolkitConfig(raw: RawToolkitConfig): ToolkitConfig {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description || undefined,
    allowedTools: raw.allowed_tools || [],
    blockedTools: raw.blocked_tools || [],
    mcpServerIds: raw.mcp_server_ids || [],
    metadata: raw.metadata || {},
    isActive: raw.is_active,
  };
}

export class ControlPlane {
  private config: ControlPlaneConfig;
  private cache = getCache();

  constructor() {
    this.config = getConfig();
    if (isMockMode) {
      log.info('Control plane running in MOCK MODE - using sample server configs');
    }
  }

  /**
   * Create a mock server config for development/testing
   */
  private createMockServerConfig(workspaceId: string, serverId: string): ServerConfig {
    // In mock mode, the serverId is treated as the server URL (base64url encoded)
    let serverUrl = `https://example.com/mcp/${serverId}`;
    let transport: TransportType = 'http';

    // Try to decode serverId as base64url URL
    try {
      const decoded = Buffer.from(serverId, 'base64url').toString('utf-8');
      if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
        serverUrl = decoded;
        // Detect transport type from URL
        if (decoded.includes('/sse') || decoded.endsWith('/sse')) {
          transport = 'sse';
        }
      }
    } catch {
      // Not a valid base64 URL, use default
    }

    log.debug('Mock server config created', { serverUrl, transport });

    return {
      id: serverId,
      serverId,
      workspaceId,
      serverLabel: `Mock Server ${serverId}`,
      url: serverUrl,
      transport: {
        preferred: transport,
        allowFallback: true,
      },
      authType: 'none' as AuthType,
      authConfig: {},
      isActive: true,
    };
  }

  private async request<T>(
    method: string,
    path: string,
    options: {
      body?: unknown;
      headers?: Record<string, string>;
    } = {}
  ): Promise<T> {
    const url = `${this.config.url}${path}`;
    log.debug(`Control plane request: ${method} ${path}`);

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error(`Control plane error: ${response.status}`, { path, error: errorText });
      throw new Error(`Control plane request failed: ${response.status} ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get MCP server configuration by ID
   */
  async getMCPServer(
    workspaceId: string,
    serverId: string
  ): Promise<ServerConfig | null> {
    // In mock mode, return a mock config
    if (isMockMode) {
      log.debug('Mock mode: creating mock server config', { workspaceId, serverId });
      return this.createMockServerConfig(workspaceId, serverId);
    }

    // Check cache first
    const cacheKey = `${workspaceId}:${serverId}`;
    const cached = await this.cache.getServerConfig<ServerConfig>(cacheKey);
    if (cached) {
      log.debug('Server config cache hit', { serverId });
      return cached;
    }

    try {
      const raw = await this.request<RawServerConfig>(
        'GET',
        `/v2/mcp-servers/${serverId}`,
        {
          headers: {
            'x-workspace-id': workspaceId,
          },
        }
      );

      const config = transformServerConfig(raw, workspaceId);

      // Cache the config
      await this.cache.setServerConfig(cacheKey, config, TIMEOUTS.SERVER_CONFIG_TTL);

      return config;
    } catch (error) {
      log.error('Failed to get MCP server', { serverId, error });
      return null;
    }
  }

  /**
   * Get OAuth tokens for an MCP server
   */
  async getMCPServerTokens(
    workspaceId: string,
    serverId: string
  ): Promise<ServerTokens | null> {
    // Check cache first
    const cacheKey = `${workspaceId}:${serverId}`;
    const cached = await this.cache.getTokens<ServerTokens>(cacheKey);
    if (cached) {
      log.debug('Token cache hit', { serverId });
      return cached;
    }

    try {
      const tokens = await this.request<ServerTokens>(
        'GET',
        `/v2/mcp-servers/${serverId}/tokens`,
        {
          headers: {
            'x-workspace-id': workspaceId,
          },
        }
      );

      // Cache tokens (with shorter TTL if expiry is known)
      let ttl = TIMEOUTS.SESSION_TTL;
      if (tokens.expires_at) {
        const expiresIn = new Date(tokens.expires_at).getTime() - Date.now();
        if (expiresIn > 0) {
          ttl = Math.min(ttl, expiresIn);
        }
      }

      await this.cache.setTokens(cacheKey, tokens, ttl);

      return tokens;
    } catch (error: any) {
      // 404 is expected if no tokens exist
      if (error.message?.includes('404')) {
        log.debug('No tokens found for server', { serverId });
        return null;
      }
      log.error('Failed to get MCP server tokens', { serverId, error });
      return null;
    }
  }

  /**
   * Save OAuth tokens for an MCP server
   */
  async saveMCPServerTokens(
    workspaceId: string,
    serverId: string,
    tokens: ServerTokens
  ): Promise<boolean> {
    try {
      await this.request('PUT', `/v2/mcp-servers/${serverId}/tokens`, {
        body: tokens,
        headers: {
          'x-workspace-id': workspaceId,
        },
      });

      // Update cache
      const cacheKey = `${workspaceId}:${serverId}`;
      await this.cache.setTokens(cacheKey, tokens);

      return true;
    } catch (error) {
      log.error('Failed to save MCP server tokens', { serverId, error });
      return false;
    }
  }

  /**
   * Delete OAuth tokens for an MCP server
   */
  async deleteMCPServerTokens(
    workspaceId: string,
    serverId: string
  ): Promise<boolean> {
    try {
      await this.request('DELETE', `/v2/mcp-servers/${serverId}/tokens`, {
        headers: {
          'x-workspace-id': workspaceId,
        },
      });

      // Clear cache
      const cacheKey = `${workspaceId}:${serverId}`;
      await this.cache.deleteTokens(cacheKey);

      return true;
    } catch (error) {
      log.error('Failed to delete MCP server tokens', { serverId, error });
      return false;
    }
  }

  /**
   * Get toolkit configuration by ID
   */
  async getMCPToolkit(
    workspaceId: string,
    toolkitId: string
  ): Promise<ToolkitConfig | null> {
    // Check cache first
    const cacheKey = `${workspaceId}:${toolkitId}`;
    const cached = await this.cache.getToolkitConfig<ToolkitConfig>(cacheKey);
    if (cached) {
      log.debug('Toolkit config cache hit', { toolkitId });
      return cached;
    }

    try {
      const raw = await this.request<RawToolkitConfig>(
        'GET',
        `/v2/mcp-toolkits/${toolkitId}`,
        {
          headers: {
            'x-workspace-id': workspaceId,
          },
        }
      );

      const config = transformToolkitConfig(raw);

      // Cache the config
      await this.cache.setToolkitConfig(cacheKey, config, TIMEOUTS.TOOLKIT_CONFIG_TTL);

      return config;
    } catch (error: any) {
      if (error.message?.includes('404')) {
        log.debug('Toolkit not found', { toolkitId });
        return null;
      }
      log.error('Failed to get toolkit', { toolkitId, error });
      return null;
    }
  }

  /**
   * List MCP servers for a workspace
   */
  async listMCPServers(workspaceId: string): Promise<ServerConfig[]> {
    try {
      const response = await this.request<{ data: RawServerConfig[] }>(
        'GET',
        '/v2/mcp-servers',
        {
          headers: {
            'x-workspace-id': workspaceId,
          },
        }
      );

      return response.data.map((raw) => transformServerConfig(raw, workspaceId));
    } catch (error) {
      log.error('Failed to list MCP servers', { workspaceId, error });
      return [];
    }
  }

  /**
   * List toolkits for a workspace
   */
  async listMCPToolkits(workspaceId: string): Promise<ToolkitConfig[]> {
    try {
      const response = await this.request<{ data: RawToolkitConfig[] }>(
        'GET',
        '/v2/mcp-toolkits',
        {
          headers: {
            'x-workspace-id': workspaceId,
          },
        }
      );

      return response.data.map(transformToolkitConfig);
    } catch (error) {
      log.error('Failed to list toolkits', { workspaceId, error });
      return [];
    }
  }

  /**
   * Invalidate cached server config
   */
  async invalidateServerCache(workspaceId: string, serverId: string): Promise<void> {
    const cacheKey = `${workspaceId}:${serverId}`;
    await this.cache.delete(cacheKey, 'mcp:servers');
  }

  /**
   * Invalidate cached toolkit config
   */
  async invalidateToolkitCache(workspaceId: string, toolkitId: string): Promise<void> {
    const cacheKey = `${workspaceId}:${toolkitId}`;
    await this.cache.delete(cacheKey, 'mcp:toolkits');
  }

  /**
   * Introspect a bearer token
   */
  async introspectToken(token: string): Promise<any | null> {
    try {
      const result = await this.request<any>('POST', '/v2/oauth/introspect', {
        body: { token },
      });
      return result;
    } catch (error) {
      log.error('Token introspection failed', { error });
      return null;
    }
  }

  /**
   * Validate an API key
   */
  async validateApiKey(apiKey: string): Promise<any | null> {
    try {
      const result = await this.request<any>('POST', '/v2/api-keys/validate', {
        body: { apiKey },
      });
      return result;
    } catch (error) {
      log.error('API key validation failed', { error });
      return null;
    }
  }

  /**
   * Get MCP server client info (for OAuth)
   */
  async getMCPServerClientInfo(workspaceId: string, serverId: string): Promise<any | null> {
    try {
      return await this.request<any>(
        'GET',
        `/v2/mcp-servers/${serverId}/client-info`,
        {
          headers: {
            'x-workspace-id': workspaceId,
          },
        }
      );
    } catch (error) {
      log.error('Failed to get MCP server client info', { serverId, error });
      return null;
    }
  }

  // ===========================================================================
  // URL-based methods (using apiKey + serverUrl as identifier)
  // ===========================================================================

  /**
   * Get OAuth tokens by API key and server URL
   * Uses apiKeyHash::normalizedServerUrl as the cache/storage key
   */
  async getMCPTokensByUrl(apiKey: string, serverUrl: string): Promise<ServerTokens | null> {
    const cacheKey = generateTokenCacheKey(apiKey, serverUrl);

    // Check cache first
    const cached = await this.cache.getTokens<ServerTokens>(cacheKey);
    if (cached) {
      log.debug('Token cache hit (URL-based)', { serverUrl });
      return cached;
    }

    // In mock mode, no tokens available
    if (isMockMode) {
      return null;
    }

    try {
      const normalizedUrl = normalizeServerUrl(serverUrl);
      const encodedUrl = Buffer.from(normalizedUrl).toString('base64url');

      const tokens = await this.request<ServerTokens>(
        'GET',
        `/v2/mcp-tokens?url=${encodedUrl}`,
        {
          headers: {
            'x-portkey-api-key': apiKey,
          },
        }
      );

      // Cache tokens
      let ttl = TIMEOUTS.SESSION_TTL;
      if (tokens.expires_at) {
        const expiresIn = new Date(tokens.expires_at).getTime() - Date.now();
        if (expiresIn > 0) {
          ttl = Math.min(ttl, expiresIn);
        }
      }

      await this.cache.setTokens(cacheKey, tokens, ttl);
      return tokens;
    } catch (error: any) {
      if (error.message?.includes('404')) {
        log.debug('No tokens found for server URL', { serverUrl });
        return null;
      }
      log.error('Failed to get MCP tokens by URL', { serverUrl, error });
      return null;
    }
  }

  /**
   * Save OAuth tokens by API key and server URL
   */
  async saveMCPTokensByUrl(
    apiKey: string,
    serverUrl: string,
    tokens: ServerTokens
  ): Promise<boolean> {
    const cacheKey = generateTokenCacheKey(apiKey, serverUrl);

    // In mock mode, just cache locally
    if (isMockMode) {
      await this.cache.setTokens(cacheKey, tokens);
      log.debug('Mock mode: tokens cached locally', { serverUrl });
      return true;
    }

    try {
      const normalizedUrl = normalizeServerUrl(serverUrl);
      const encodedUrl = Buffer.from(normalizedUrl).toString('base64url');

      await this.request('PUT', `/v2/mcp-tokens?url=${encodedUrl}`, {
        body: tokens,
        headers: {
          'x-portkey-api-key': apiKey,
        },
      });

      // Update cache
      await this.cache.setTokens(cacheKey, tokens);
      return true;
    } catch (error) {
      log.error('Failed to save MCP tokens by URL', { serverUrl, error });
      return false;
    }
  }

  /**
   * Delete OAuth tokens by API key and server URL
   */
  async deleteMCPTokensByUrl(apiKey: string, serverUrl: string): Promise<boolean> {
    const cacheKey = generateTokenCacheKey(apiKey, serverUrl);

    // In mock mode, just clear cache
    if (isMockMode) {
      await this.cache.deleteTokens(cacheKey);
      return true;
    }

    try {
      const normalizedUrl = normalizeServerUrl(serverUrl);
      const encodedUrl = Buffer.from(normalizedUrl).toString('base64url');

      await this.request('DELETE', `/v2/mcp-tokens?url=${encodedUrl}`, {
        headers: {
          'x-portkey-api-key': apiKey,
        },
      });

      // Clear cache
      await this.cache.deleteTokens(cacheKey);
      return true;
    } catch (error) {
      log.error('Failed to delete MCP tokens by URL', { serverUrl, error });
      return false;
    }
  }

  /**
   * Get toolkit configuration by API key and toolkit ID
   */
  async getMCPToolkitByApiKey(
    apiKey: string,
    toolkitId: string
  ): Promise<ToolkitConfig | null> {
    // Generate cache key using API key hash
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex').substring(0, 16);
    const cacheKey = `${apiKeyHash}:toolkit:${toolkitId}`;

    // Check cache first
    const cached = await this.cache.getToolkitConfig<ToolkitConfig>(cacheKey);
    if (cached) {
      log.debug('Toolkit config cache hit (API key based)', { toolkitId });
      return cached;
    }

    // In mock mode, return null (no toolkits)
    if (isMockMode) {
      return null;
    }

    try {
      const raw = await this.request<RawToolkitConfig>(
        'GET',
        `/v2/mcp-toolkits/${toolkitId}`,
        {
          headers: {
            'x-portkey-api-key': apiKey,
          },
        }
      );

      const config = transformToolkitConfig(raw);

      // Cache the config
      await this.cache.setToolkitConfig(cacheKey, config, TIMEOUTS.TOOLKIT_CONFIG_TTL);

      return config;
    } catch (error: any) {
      if (error.message?.includes('404')) {
        log.debug('Toolkit not found', { toolkitId });
        return null;
      }
      log.error('Failed to get toolkit by API key', { toolkitId, error });
      return null;
    }
  }

  /**
   * Get MCP client info by API key and server URL (for OAuth discovery)
   */
  async getMCPClientInfoByUrl(apiKey: string, serverUrl: string): Promise<any | null> {
    // In mock mode, return null
    if (isMockMode) {
      return null;
    }

    try {
      const normalizedUrl = normalizeServerUrl(serverUrl);
      const encodedUrl = Buffer.from(normalizedUrl).toString('base64url');

      return await this.request<any>(
        'GET',
        `/v2/mcp-client-info?url=${encodedUrl}`,
        {
          headers: {
            'x-portkey-api-key': apiKey,
          },
        }
      );
    } catch (error) {
      log.error('Failed to get MCP client info by URL', { serverUrl, error });
      return null;
    }
  }

  // ===========================================================================
  // MCP Presign Bundle methods
  // ===========================================================================

  /**
   * Get MCP presign bundle by bundle token
   */
  async getMCPBundle(bundleToken: string): Promise<{
    id: string;
    bundle_token: string;
    session_id: string;
    servers: any;
    expires_at: string;
    created_at: string;
  } | null> {
    // In mock mode, return null
    if (isMockMode) {
      log.debug('Mock mode: MCP bundles not available');
      return null;
    }

    // Check cache first
    const cacheKey = `mcp:bundle:${bundleToken}`;
    const cached = await this.cache.get<any>(cacheKey, 'mcp:bundles');
    if (cached) {
      log.debug('Bundle cache hit', { bundleToken: bundleToken.slice(0, 8) + '...' });
      return cached;
    }

    try {
      const bundle = await this.request<any>(
        'GET',
        `/v2/mcp-bundles/${bundleToken}`
      );

      // Cache the bundle (with short TTL based on expiry)
      if (bundle && bundle.expires_at) {
        const expiresIn = new Date(bundle.expires_at).getTime() - Date.now();
        if (expiresIn > 0) {
          const ttl = Math.min(expiresIn, 5 * 60 * 1000); // max 5 minutes cache
          await this.cache.set(cacheKey, bundle, {
            namespace: 'mcp:bundles',
            ttl,
          });
        }
      }

      return bundle;
    } catch (error: any) {
      if (error.message?.includes('404')) {
        log.debug('Bundle not found', { bundleToken: bundleToken.slice(0, 8) + '...' });
        return null;
      }
      log.error('Failed to get MCP bundle', { error });
      return null;
    }
  }
}

// Singleton instance
let controlPlaneInstance: ControlPlane | null = null;

export function getControlPlane(): ControlPlane {
  if (!controlPlaneInstance) {
    controlPlaneInstance = new ControlPlane();
  }
  return controlPlaneInstance;
}

// Middleware to attach control plane to context
import { createMiddleware } from 'hono/factory';
import type { Context, Next } from 'hono';

type Env = {
  Variables: {
    controlPlane?: ControlPlane;
  };
};

export const controlPlaneMiddleware = createMiddleware<Env>(async (c: Context, next: Next) => {
  // Only initialize control plane if environment is configured
  const cpUrl = process.env[ENV_VARS.CONTROL_PLANE_URL];
  const cpApiKey = process.env[ENV_VARS.CONTROL_PLANE_API_KEY];

  if (cpUrl && cpApiKey) {
    try {
      c.set('controlPlane', getControlPlane());
    } catch (error) {
      log.warn('Failed to initialize control plane', { error });
    }
  }

  return next();
});
