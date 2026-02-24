/**
 * @file EverythingServer.ts
 * Spawns the official MCP "everything" server for E2E testing
 *
 * The everything server is a reference implementation from the MCP project
 * that implements all MCP features (tools, resources, prompts, sampling).
 * Using it ensures we test against spec-compliant behavior.
 *
 * @see https://github.com/modelcontextprotocol/servers/tree/main/src/everything
 */

import { spawn, ChildProcess } from 'child_process';
import { createInterface } from 'readline';

export interface EverythingServerOptions {
  /** Port to run on (default: random available port) */
  port?: number;
  /** Transport type (default: streamableHttp) */
  transport?: 'stdio' | 'sse' | 'streamableHttp';
  /** Timeout for server startup in ms (default: 10000) */
  startupTimeout?: number;
  /** Enable debug logging */
  debug?: boolean;
}

export class EverythingServer {
  private process: ChildProcess | null = null;
  private port: number;
  private transport: string;
  private startupTimeout: number;
  private debug: boolean;
  private url: string | null = null;

  public isRunning = false;

  constructor(options: EverythingServerOptions = {}) {
    this.port = options.port ?? 0; // 0 = let the server pick
    this.transport = options.transport ?? 'streamableHttp';
    this.startupTimeout = options.startupTimeout ?? 10000;
    this.debug = options.debug ?? false;
  }

  /**
   * Start the everything server
   * @returns The URL of the running server's MCP endpoint
   */
  async start(): Promise<string> {
    if (this.isRunning) {
      return this.url!;
    }

    return new Promise((resolve, reject) => {
      const args = [
        '-y',
        '@modelcontextprotocol/server-everything',
        this.transport,
      ];

      // Add port if specified
      if (this.port > 0) {
        args.push('--port', String(this.port));
      }

      if (this.debug) {
        console.log(`[EverythingServer] Starting: npx ${args.join(' ')}`);
      }

      this.process = spawn('npx', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });

      const timeout = setTimeout(() => {
        this.stop();
        reject(new Error('EverythingServer startup timeout'));
      }, this.startupTimeout);

      // Read stdout to find the server URL
      if (this.process.stdout) {
        const rl = createInterface({ input: this.process.stdout });

        rl.on('line', (line) => {
          if (this.debug) {
            console.log(`[EverythingServer] stdout: ${line}`);
          }

          // The server prints something like "Server running on http://localhost:3001/mcp"
          // or "Streamable HTTP server listening on port 3001"
          const urlMatch = line.match(/https?:\/\/[^\s]+/);
          const portMatch = line.match(/port\s+(\d+)/i);

          if (urlMatch) {
            this.url = urlMatch[0];
            // Ensure it ends with /mcp for streamableHttp
            if (
              !this.url.endsWith('/mcp') &&
              this.transport === 'streamableHttp'
            ) {
              this.url = this.url.replace(/\/?$/, '/mcp');
            }
            this.isRunning = true;
            clearTimeout(timeout);
            resolve(this.url);
          } else if (portMatch) {
            this.port = parseInt(portMatch[1], 10);
            this.url = `http://127.0.0.1:${this.port}/mcp`;
            this.isRunning = true;
            clearTimeout(timeout);
            resolve(this.url);
          }
        });
      }

      // Log stderr
      if (this.process.stderr) {
        const rl = createInterface({ input: this.process.stderr });
        rl.on('line', (line) => {
          if (this.debug) {
            console.log(`[EverythingServer] stderr: ${line}`);
          }
        });
      }

      this.process.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to start EverythingServer: ${err.message}`));
      });

      this.process.on('exit', (code) => {
        if (this.debug) {
          console.log(`[EverythingServer] Process exited with code ${code}`);
        }
        this.isRunning = false;
        if (!this.url) {
          clearTimeout(timeout);
          reject(new Error(`EverythingServer exited with code ${code}`));
        }
      });
    });
  }

  /**
   * Stop the everything server
   */
  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM');

      // Wait a bit for graceful shutdown
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
      this.url = null;
    }
  }

  /**
   * Get the URL of the MCP endpoint
   */
  getUrl(): string {
    if (!this.url) {
      throw new Error('EverythingServer not started');
    }
    return this.url;
  }

  /**
   * Get the port the server is running on
   */
  getPort(): number {
    return this.port;
  }
}

/**
 * Known tools available in the everything server
 * Useful for test assertions
 */
export const EVERYTHING_SERVER_TOOLS = [
  'echo',
  'add',
  'longRunningOperation',
  'sampleLLM',
  'getTinyImage',
  'annotatedMessage',
  'getResourceReference',
  'getPromptReference',
] as const;

/**
 * Known prompts available in the everything server
 */
export const EVERYTHING_SERVER_PROMPTS = [
  'simple_prompt',
  'complex_prompt',
] as const;
