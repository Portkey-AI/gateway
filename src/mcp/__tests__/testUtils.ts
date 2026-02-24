/**
 * @file testUtils.ts
 * Test utilities for MCP gateway E2E testing
 *
 * Provides helpers for:
 * - Starting/stopping the gateway
 * - Creating server configurations
 * - Common test setup/teardown
 */

import { spawn, ChildProcess } from 'child_process';
import { createInterface } from 'readline';
import { writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { MockMCPServer } from './MockMCPServer';
import { EverythingServer } from './EverythingServer';
import { TestClient } from './TestClient';
import { ServerConfig } from '../types/mcp';

// Re-export for convenience
export { TestClient } from './TestClient';
export { MockMCPServer } from './MockMCPServer';
export { EverythingServer } from './EverythingServer';

/**
 * Load environment variables from .env file
 * Handles both `KEY=value` and `export KEY=value` formats
 */
function loadEnvFile(): Record<string, string> {
  const envPath = join(__dirname, '../../../.env');
  const envVars: Record<string, string> = {};

  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      let trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        // Handle 'export KEY=value' format
        if (trimmed.startsWith('export ')) {
          trimmed = trimmed.substring(7);
        }
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex);
          let value = trimmed.substring(eqIndex + 1);
          // Remove quotes if present
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
          envVars[key] = value;
        }
      }
    }
  }

  return envVars;
}

// Test data directory
const TEST_DATA_DIR = join(__dirname, '../../../.test-data');

export interface GatewayOptions {
  /** Port to run gateway on */
  port?: number;
  /** Server configurations */
  servers?: Record<string, Partial<ServerConfig>>;
  /** Environment variables */
  env?: Record<string, string>;
  /** Startup timeout in ms */
  startupTimeout?: number;
  /** Enable debug logging */
  debug?: boolean;
}

export class GatewayHarness {
  private process: ChildProcess | null = null;
  private port: number;
  private servers: Record<string, Partial<ServerConfig>>;
  private env: Record<string, string>;
  private startupTimeout: number;
  private debug: boolean;
  private configPath: string;

  public isRunning = false;
  public baseUrl: string | null = null;

  constructor(options: GatewayOptions = {}) {
    // Use a random port between 10000-60000 if not specified
    this.port = options.port ?? 10000 + Math.floor(Math.random() * 50000);
    this.servers = options.servers ?? {};
    this.env = options.env ?? {};
    this.startupTimeout = options.startupTimeout ?? 15000;
    this.debug = options.debug ?? false;
    this.configPath = join(TEST_DATA_DIR, `servers-${Date.now()}.json`);
  }

  /**
   * Start the gateway with the configured servers
   */
  async start(): Promise<string> {
    if (this.isRunning) {
      return this.baseUrl!;
    }

    // Ensure test data directory exists
    if (!existsSync(TEST_DATA_DIR)) {
      mkdirSync(TEST_DATA_DIR, { recursive: true });
    }

    // Write server config
    writeFileSync(
      this.configPath,
      JSON.stringify({ servers: this.servers }, null, 2)
    );

    return new Promise((resolve, reject) => {
      // Load .env file and merge with test-specific overrides
      const dotEnv = loadEnvFile();
      const env: Record<string, string> = {
        ...(process.env as Record<string, string>),
        ...dotEnv,
        NODE_ENV: 'test',
        SERVERS_CONFIG_PATH: this.configPath,
        MCP_PORT: String(this.port),
        // Disable control plane for local tests
        ALBUS_BASEPATH: '',
        ...this.env,
      };

      if (this.debug) {
        console.log('[Gateway] Starting with config:', this.configPath);
        console.log(
          '[Gateway] Servers:',
          JSON.stringify(this.servers, null, 2)
        );
      }

      // Start the gateway using tsx with --mcp-node flag
      // Uses start-server.ts which properly initializes the MCP gateway
      this.process = spawn(
        'npx',
        [
          'tsx',
          join(__dirname, '../../start-server.ts'),
          '--mcp-node',
          '--mcp-port',
          String(this.port),
        ],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
          env,
          cwd: join(__dirname, '../../..'),
        }
      );

      const timeout = setTimeout(() => {
        this.stop();
        reject(new Error('Gateway startup timeout'));
      }, this.startupTimeout);

      // Parse stdout for startup message
      if (this.process.stdout) {
        const rl = createInterface({ input: this.process.stdout });
        rl.on('line', (line) => {
          if (this.debug) {
            console.log(`[Gateway] ${line}`);
          }

          // Look for MCP Gateway startup message
          // Output format: "🤯 MCP Gateway is running at:" followed by URL on next line
          // Or: "http://localhost:XXXX"
          const urlMatch =
            line.match(/https?:\/\/localhost:(\d+)/i) ||
            line.match(/https?:\/\/127\.0\.0\.1:(\d+)/i);

          if (urlMatch) {
            this.port = parseInt(urlMatch[1], 10);
            this.baseUrl = `http://127.0.0.1:${this.port}`;
            this.isRunning = true;
            clearTimeout(timeout);
            resolve(this.baseUrl);
          }
        });
      }

      if (this.process.stderr) {
        const rl = createInterface({ input: this.process.stderr });
        rl.on('line', (line) => {
          if (this.debug) {
            console.log(`[Gateway ERROR] ${line}`);
          }
        });
      }

      this.process.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to start gateway: ${err.message}`));
      });

      this.process.on('exit', (code) => {
        if (this.debug) {
          console.log(`[Gateway] Exited with code ${code}`);
        }
        this.isRunning = false;
        if (!this.baseUrl) {
          clearTimeout(timeout);
          reject(new Error(`Gateway exited with code ${code}`));
        }
      });
    });
  }

  /**
   * Stop the gateway
   */
  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM');

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.process) {
            this.process.kill('SIGKILL');
          }
          resolve();
        }, 2000);

        this.process!.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      this.process = null;
      this.isRunning = false;
    }

    // Clean up config file
    if (existsSync(this.configPath)) {
      rmSync(this.configPath);
    }
  }

  /**
   * Get MCP endpoint URL for a server
   */
  getMcpUrl(workspaceId: string, serverId: string): string {
    if (!this.baseUrl) {
      throw new Error('Gateway not started');
    }
    return `${this.baseUrl}/${workspaceId}/${serverId}/mcp`;
  }

  /**
   * Update server configuration (requires restart)
   */
  updateServers(servers: Record<string, Partial<ServerConfig>>): void {
    this.servers = { ...this.servers, ...servers };
  }
}

/**
 * Complete test environment with gateway, upstream server, and client
 */
export interface TestEnvironment {
  gateway: GatewayHarness;
  upstream: MockMCPServer | EverythingServer;
  client: TestClient;
  /** Cleanup function - call in afterAll/afterEach */
  cleanup: () => Promise<void>;
}

/**
 * Create a complete test environment
 */
export async function createTestEnvironment(options: {
  /** Use the official everything server instead of mock */
  useEverythingServer?: boolean;
  /** Workspace ID for the test server */
  workspaceId?: string;
  /** Server ID for the test server */
  serverId?: string;
  /** Additional server config */
  serverConfig?: Partial<ServerConfig>;
  /** Gateway options */
  gatewayOptions?: Partial<GatewayOptions>;
  /** Use local OAuth instead of API key (works without control plane) */
  useLocalOAuth?: boolean;
  /** API key for authentication (requires control plane) */
  apiKey?: string;
  /** Enable debug logging */
  debug?: boolean;
}): Promise<TestEnvironment> {
  const {
    useEverythingServer = false,
    workspaceId = 'test-workspace',
    serverId = 'test-server',
    serverConfig = {},
    gatewayOptions = {},
    useLocalOAuth = true, // Default to local OAuth (works without control plane)
    apiKey,
    debug = false,
  } = options;

  // Start upstream server
  const upstream = useEverythingServer
    ? new EverythingServer({ debug })
    : new MockMCPServer();

  const upstreamUrl = await upstream.start();

  if (debug) {
    console.log(`[TestEnv] Upstream started at ${upstreamUrl}`);
  }

  // Create gateway with server pointing to upstream
  const serverKey = `${workspaceId}/${serverId}`;
  const gateway = new GatewayHarness({
    ...gatewayOptions,
    debug,
    servers: {
      [serverKey]: {
        serverId,
        workspaceId,
        url: upstreamUrl,
        headers: {},
        ...serverConfig,
      },
    },
  });

  await gateway.start();

  if (debug) {
    console.log(`[TestEnv] Gateway started at ${gateway.baseUrl}`);
  }

  // Get authentication token
  let authToken: string | undefined;
  if (useLocalOAuth && gateway.baseUrl) {
    if (debug) {
      console.log(`[TestEnv] Getting local OAuth token...`);
    }
    const creds = await getLocalOAuthToken(gateway.baseUrl);
    authToken = creds.accessToken;
    if (debug) {
      console.log(
        `[TestEnv] Got OAuth token: ${authToken.substring(0, 20)}...`
      );
    }
  }

  // Create test client with OAuth token or API key
  const client = new TestClient({
    gatewayUrl: gateway.getMcpUrl(workspaceId, serverId),
    oauthToken: authToken,
    apiKey: apiKey,
  });

  const cleanup = async () => {
    await client.disconnect();
    await gateway.stop();
    await upstream.stop();
  };

  return { gateway, upstream, client, cleanup };
}

/**
 * Helper to create a server config for testing
 */
export function createServerConfig(
  upstreamUrl: string,
  overrides: Partial<ServerConfig> = {}
): Partial<ServerConfig> {
  return {
    url: upstreamUrl,
    headers: {},
    auth_type: 'headers',
    ...overrides,
  };
}

/**
 * Clean up test data directory
 */
export function cleanupTestData(): void {
  if (existsSync(TEST_DATA_DIR)) {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
}

/**
 * OAuth client registration and token generation for local testing
 * The gateway supports full OAuth locally without a control plane
 */
export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
  accessToken: string;
}

/**
 * Register an OAuth client and get an access token from the gateway
 * This works with the gateway's local OAuth implementation (no control plane needed)
 */
export async function getLocalOAuthToken(
  gatewayBaseUrl: string
): Promise<OAuthCredentials> {
  // Step 1: Register a client
  const registerResponse = await fetch(`${gatewayBaseUrl}/oauth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: 'mcp-e2e-test-client',
      grant_types: ['client_credentials'],
      token_endpoint_auth_method: 'client_secret_post',
    }),
  });

  if (!registerResponse.ok) {
    throw new Error(
      `Failed to register OAuth client: ${registerResponse.status}`
    );
  }

  const client = (await registerResponse.json()) as {
    client_id: string;
    client_secret: string;
  };
  const clientId = client.client_id;
  const clientSecret = client.client_secret;

  // Step 2: Get an access token using client_credentials
  const tokenResponse = await fetch(`${gatewayBaseUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Failed to get access token: ${tokenResponse.status}`);
  }

  const tokenData = (await tokenResponse.json()) as { access_token: string };

  return {
    clientId,
    clientSecret,
    accessToken: tokenData.access_token,
  };
}

/**
 * Simple helper to get just the access token string
 */
export async function getOAuthToken(gatewayBaseUrl: string): Promise<string> {
  const creds = await getLocalOAuthToken(gatewayBaseUrl);
  return creds.accessToken;
}
