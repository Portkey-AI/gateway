import { McpServer, McpServerConfig, ToolCall } from '../../types/requestBody';
import { RequestContext } from './requestContext';
import { GatewayError } from '../../errors/GatewayError';

// services/mcpService.ts
export class McpService {
  private mcpConnections = new Map<string, MinimalMCPClient>();
  private mcpTools = new Map<string, LLMFunction[]>();
  private mcpToolToServerMap = new Map<string, string>();

  constructor(private requestContext: RequestContext) {}

  async init(): Promise<void> {
    const mcpServers: McpServer[] = this.requestContext.mcpServers;
    if (!mcpServers) {
      return;
    }
    this.validateServerObjects(mcpServers);
    for (const server of mcpServers) {
      try {
        const client = await this.connectToMcpServer(server);
        if (client) {
          this.mcpConnections.set(server.server_label, client);
          let tools = await client.listTools();
          // console.log('MCP tools', tools);
          if (server.allowed_tools && server.allowed_tools.length) {
            tools = tools.filter((tool) =>
              server.allowed_tools!.includes(tool.name)
            );
          }
          const llmTools = this.transformToolsForLLM(
            server.server_label,
            tools
          );
          this.mcpTools.set(server.server_label, llmTools);
        }
      } catch (error) {
        console.error(
          `Error connecting to MCP server ${server.server_url}:`,
          error
        );
        throw new GatewayError(
          `Error connecting to MCP server \`${server.server_url}\`.`
        );
      }
    }
    return;
  }

  private validateServerObjects(servers: McpServer[]): void {
    if (!servers || servers.length === 0) {
      return;
    }

    // Pre-compile regex patterns for better performance
    const labelRegex = /^[a-zA-Z][a-zA-Z0-9-_]*$/;
    const urlRegex = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

    // Private IP ranges and localhost patterns
    const privatePatterns = [
      /localhost/i,
      /127\.0\.0\.1/,
      /::1/,
      /0\.0\.0\.0/,
      // Additional private IP ranges for comprehensive SSRF protection
      /10\.\d{1,3}\.\d{1,3}\.\d{1,3}/, // 10.0.0.0/8
      /172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}/, // 172.16.0.0/12
      /192\.168\.\d{1,3}\.\d{1,3}/, // 192.168.0.0/16
      /169\.254\.\d{1,3}\.\d{1,3}/, // 169.254.0.0/16 (link-local)
    ];

    const seenLabels = new Set<string>();

    for (const server of servers) {
      // Validate required fields exist
      if (!server.server_label) {
        throw new GatewayError(
          'MCP_SERVER_LABEL_NOT_FOUND: MCP server label not found'
        );
      }

      if (!server.server_url) {
        throw new GatewayError(
          'MCP_SERVER_URL_NOT_FOUND: MCP server URL not found'
        );
      }

      // Validate label format
      if (!labelRegex.test(server.server_label)) {
        throw new GatewayError(
          'MCP_SERVER_LABEL_INVALID: MCP server label must start with a letter and can only contain letters, numbers, hyphens and underscores'
        );
      }

      // Check label uniqueness (O(1) lookup instead of O(n))
      if (seenLabels.has(server.server_label)) {
        throw new GatewayError(
          'MCP_SERVER_LABEL_NOT_UNIQUE: MCP server label must be unique'
        );
      }
      seenLabels.add(server.server_label);

      // Validate URL format first (fail fast)
      if (!urlRegex.test(server.server_url)) {
        throw new GatewayError(
          'MCP_SERVER_URL_INVALID: MCP server URL must be a valid URL'
        );
      }

      // Check for SSRF vulnerabilities
      if (privatePatterns.some((pattern) => pattern.test(server.server_url))) {
        throw new GatewayError(
          'MCP_SERVER_URL_INVALID: MCP server URL must not hit private IPs or localhost'
        );
      }
    }
  }

  get tools(): LLMFunction[] {
    return Array.from(this.mcpTools.values()).flat();
  }

  /**
   * Find MCP tools and non-MCP tools from a list of tool calls
   * based on the MCP tools loaded in the MCP service
   * @param toolCalls - Tool calls to find MCP tools for
   * @returns - MCP tools and non-MCP tools
   */
  findMCPTools(toolCalls: ToolCall[]): {
    mcpToolsMap: Map<string, ToolCall>;
    nonMcpToolsMap: Map<string, ToolCall>;
  } {
    let mcpToolsMap: Map<string, ToolCall> = new Map(),
      nonMcpToolsMap: Map<string, ToolCall> = new Map();
    const mcpToolNames = this.tools.map((tool) => tool.function.name);
    toolCalls.forEach((toolCall: ToolCall) => {
      if (mcpToolNames.includes(toolCall.function.name)) {
        mcpToolsMap.set(toolCall.function.name, toolCall);
      } else {
        nonMcpToolsMap.set(toolCall.function.name, toolCall);
      }
    });
    return { mcpToolsMap, nonMcpToolsMap };
  }

  async executeTool(
    functionName: string,
    toolArgs: any
  ): Promise<ToolExecutionResult> {
    const serverName = this.mcpToolToServerMap.get(functionName);
    if (!serverName) {
      throw new Error(
        `MCP_SERVER_TOOL_NOT_FOUND: MCP server not found for tool ${functionName}`
      );
    }
    const client = this.mcpConnections.get(serverName);

    if (!client || !this.mcpTools.has(serverName)) {
      throw new Error(
        `MCP_SERVER_TOOL_NOT_FOUND: MCP server ${serverName} not found or tool name not loaded in the mcp server`
      );
    }

    const toolName = functionName.substring(serverName.length + 1);
    return await client.executeTool(toolName, toolArgs);
  }

  private transformToolsForLLM(
    servername: string,
    mcpTools: Tool[]
  ): LLMFunction[] {
    return mcpTools.map((tool) => {
      const functionName = `${servername}_${tool.name}`;
      this.mcpToolToServerMap.set(functionName, servername);
      return {
        type: 'function' as const,
        function: {
          name: functionName,
          description: tool.description,
          parameters: {
            type: 'object' as const,
            properties: tool.inputSchema.properties || {},
            required: tool.inputSchema.required || [],
            // Preserve any additional schema properties like additionalProperties, etc.
            ...Object.fromEntries(
              Object.entries(tool.inputSchema).filter(
                ([key]) => !['type', 'properties', 'required'].includes(key)
              )
            ),
          },
        },
      };
    });
  }

  private async connectToMcpServer(
    server: McpServer
  ): Promise<MinimalMCPClient | null> {
    const client = new MinimalMCPClient(server.server_url, server.headers);
    const result = await client.initialize();
    if (!result.capabilities.tools) {
      throw new Error(`MCP server ${server.server_url} does not support tools`);
      return null;
    }
    return client;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    // console.log('Disposing MCP service...');

    for (const [name, client] of this.mcpConnections) {
      try {
        // console.log('Closing MCP connection to', name);
        await Promise.race([
          client.close(),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('Close timeout')), 10000)
          ),
        ]);
      } catch (error) {
        console.error(`Error closing MCP connection to ${name}:`, error);
        // Continue closing other connections even if one fails
      }
    }

    this.mcpConnections.clear();
    this.mcpTools.clear();

    // console.log('MCP service disposed');
  }
}

// LLM Function Call format (OpenAI-style)
export interface LLMFunction {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: {
      type: 'object';
      properties?: Record<string, any>;
      required?: string[];
      [key: string]: any;
    };
  };
}

// Minimal MCP Client for fetching tools from remote servers
// Supports both StreamableHTTP and SSE transports

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: any;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface Tool {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, any>;
    required?: string[];
  };
  outputSchema?: {
    type: 'object';
    properties?: Record<string, any>;
    required?: string[];
  };
}

interface InitializeResult {
  protocolVersion: string;
  capabilities: {
    tools?: any;
    [key: string]: any;
  };
  serverInfo: {
    name: string;
    version: string;
  };
  instructions?: string;
}

interface ListToolsResult {
  tools: Tool[];
  nextCursor?: string;
}

interface ToolExecutionResult {
  content?: Array<{
    type: 'text' | 'image' | 'audio' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
    resource?: any;
  }>;
  structuredContent?: Record<string, any>;
  isError?: boolean;
}

class MinimalMCPClient {
  private url: URL;
  private headers: Record<string, string>;
  private messageId = 0;
  private sessionId?: string;
  private isSSE = false;
  private sseEndpoint?: URL;
  private eventSource?: EventSource;
  private abortController?: AbortController; // Add this
  private streamReader?: ReadableStreamDefaultReader<Uint8Array>; // Add this
  private pendingRequests = new Map<
    string | number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
    }
  >();
  private sseConnectionResolve?: () => void;
  private sseConnectionReject?: (error: Error) => void;

  constructor(
    serverUrl: string,
    headers?: Record<string, string>,
    options?: { messageEndpoint?: string }
  ) {
    this.url = new URL(serverUrl);
    this.headers = headers || {};

    // Check if this looks like an SSE endpoint
    this.isSSE = serverUrl.includes('/sse') || serverUrl.includes('sse');

    // If custom message endpoint provided, use it
    if (options?.messageEndpoint) {
      this.sseEndpoint = new URL(options.messageEndpoint);
    }
  }

  private getNextMessageId(): number {
    return ++this.messageId;
  }

  private getAuthHeaders(): HeadersInit {
    const headers: HeadersInit = {
      ...(this.headers || {}),
    };

    if (!this.isSSE) {
      headers['Content-Type'] = 'application/json';
      headers['Accept'] = 'application/json, text/event-stream';
    }

    return headers;
  }

  private async initializeSSE(): Promise<void> {
    if (!this.isSSE) return;

    return new Promise((resolve, reject) => {
      // Set up a timeout for the SSE connection
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for SSE endpoint from server'));
      }, 10000); // 10 second timeout

      // Store resolve/reject to call when endpoint is received
      const originalResolve = resolve;
      const originalReject = reject;

      this.sseConnectionResolve = () => {
        clearTimeout(timeout);
        originalResolve();
      };

      this.sseConnectionReject = (error: Error) => {
        clearTimeout(timeout);
        originalReject(error);
      };

      // Start the SSE connection
      this.establishSSEConnection().catch(this.sseConnectionReject);
    });
  }

  private async establishSSEConnection(): Promise<void> {
    const headers = new Headers(this.getAuthHeaders());
    headers.set('Accept', 'text/event-stream');

    const response = await fetch(this.url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(
        `Failed to establish SSE connection: HTTP ${response.status}: ${response.statusText}`
      );
    }

    // The server should send an 'endpoint' event with the POST URL
    // We'll wait for this in the stream parser
    this.sseEndpoint = undefined;

    // Parse SSE stream for endpoint information and responses
    this.parseSSEStream(response);
  }

  private parseSSEStream(response: Response): void {
    if (!response.body) return;

    // Create abort controller for this stream
    this.abortController = new AbortController();

    const reader = response.body
      .pipeThrough(new TextDecoderStream())
      .getReader();

    let buffer = '';
    let currentEvent = {
      event: '',
      data: '',
      id: '',
    };

    const processStream = async () => {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          // Check if aborted
          if (this.abortController?.signal.aborted) {
            // console.log('SSE stream processing aborted');
            break;
          }

          buffer += value;

          // Process line by line
          let lineEnd;
          while ((lineEnd = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, lineEnd);
            buffer = buffer.slice(lineEnd + 1);

            // Remove \r if present (for \r\n line endings)
            const cleanLine = line.replace(/\r$/, '');

            if (cleanLine === '') {
              // Empty line = end of event, dispatch it
              if (currentEvent.data || currentEvent.event) {
                this.handleSSEEvent(currentEvent.event, currentEvent.data);
              }
              // Reset for next event
              currentEvent = { event: '', data: '', id: '' };
            } else if (cleanLine.startsWith('event: ')) {
              currentEvent.event = cleanLine.slice(7);
            } else if (cleanLine.startsWith('data: ')) {
              // Multiple data lines should be joined with \n
              if (currentEvent.data) {
                currentEvent.data += '\n' + cleanLine.slice(6);
              } else {
                currentEvent.data = cleanLine.slice(6);
              }
            } else if (cleanLine.startsWith('id: ')) {
              currentEvent.id = cleanLine.slice(4);
            }
            // Ignore other fields like retry, etc.
          }
        }
      } catch (error) {
        if (!this.abortController?.signal.aborted) {
          console.error('SSE stream error:', error);
          if (this.sseConnectionReject) {
            this.sseConnectionReject(error as Error);
            this.sseConnectionResolve = undefined;
            this.sseConnectionReject = undefined;
          }
        }
      } finally {
        try {
          reader.releaseLock();
        } catch (e) {
          // Reader might already be released
        }
      }
    };

    processStream();
  }

  private handleSSEEvent(eventType: string, data: string): void {
    if (eventType === 'endpoint') {
      // Server is telling us the POST endpoint URL (usually includes sessionId)
      try {
        this.sseEndpoint = new URL(data, this.url);
        // console.log('SSE POST endpoint received:', this.sseEndpoint.href);

        // Extract session ID from the endpoint URL if present
        const sessionId = this.sseEndpoint.searchParams.get('sessionId');
        if (sessionId) {
          this.sessionId = sessionId;
          // console.log('Session ID extracted:', sessionId);
        }

        // Resolve the SSE connection promise now that we have the endpoint
        if (this.sseConnectionResolve) {
          this.sseConnectionResolve();
          this.sseConnectionResolve = undefined;
          this.sseConnectionReject = undefined;
        }
      } catch (error) {
        console.warn('Invalid endpoint URL from SSE:', data, error);
        if (this.sseConnectionReject) {
          this.sseConnectionReject(new Error(`Invalid endpoint URL: ${data}`));
          this.sseConnectionResolve = undefined;
          this.sseConnectionReject = undefined;
        }
      }
      return;
    }

    // Handle JSON-RPC responses (default event type or 'message')
    if (!eventType || eventType === 'message') {
      try {
        // Try to parse as JSON
        const jsonResponse: JSONRPCResponse = JSON.parse(data);
        // console.log(
        //   'Parsed JSON-RPC response:',
        //   jsonResponse.id,
        //   jsonResponse.error ? 'ERROR' : 'SUCCESS'
        // );

        const pending = this.pendingRequests.get(jsonResponse.id);

        if (pending) {
          this.pendingRequests.delete(jsonResponse.id);

          if (jsonResponse.error) {
            pending.reject(
              new Error(
                `MCP Error ${jsonResponse.error.code}: ${jsonResponse.error.message}`
              )
            );
          } else {
            pending.resolve(jsonResponse.result);
          }
        } else {
          console.warn(
            'Received response for unknown request ID:',
            jsonResponse.id
          );
        }
      } catch (error) {
        console.error('Failed to parse JSON from SSE data:', error);
        console.error('Raw data (first 500 chars):', data.substring(0, 500));
        console.error(
          'Raw data (last 100 chars):',
          data.substring(Math.max(0, data.length - 100))
        );
      }
    }
  }

  private async sendRequest(request: JSONRPCRequest): Promise<any> {
    if (this.isSSE) {
      return this.sendSSERequest(request);
    } else {
      return this.sendDirectRequest(request);
    }
  }

  private async sendSSERequest(request: JSONRPCRequest): Promise<any> {
    if (!this.sseEndpoint) {
      throw new Error('SSE POST endpoint not yet received from server');
    }

    return new Promise((resolve, reject) => {
      // Store the pending request
      this.pendingRequests.set(request.id, { resolve, reject });

      // Prepare POST URL - session ID should already be in the endpoint URL
      const postUrl = new URL(this.sseEndpoint!.href);

      // Send POST request to the endpoint (session ID is in the URL)
      const headers = new Headers(this.getAuthHeaders());
      headers.set('Content-Type', 'application/json');

      fetch(postUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      }).catch((error) => {
        this.pendingRequests.delete(request.id);
        reject(new Error(`Failed to send SSE request: ${error.message}`));
      });

      // Set timeout for the request
      setTimeout(() => {
        if (this.pendingRequests.has(request.id)) {
          this.pendingRequests.delete(request.id);
          reject(new Error('SSE request timeout'));
        }
      }, 30000); // 30 second timeout
    });
  }

  private async sendDirectRequest(request: JSONRPCRequest): Promise<any> {
    const headers = new Headers(this.getAuthHeaders());

    // Include session ID if we have one
    if (this.sessionId) {
      headers.set('mcp-session-id', this.sessionId);
    }

    // IMPORTANT: Add Accept header for both JSON and SSE
    headers.set('Accept', 'application/json, text/event-stream');

    const response = await fetch(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    });

    // Capture session ID from response if present
    const newSessionId = response.headers.get('mcp-session-id');
    if (newSessionId) {
      this.sessionId = newSessionId;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      // Direct JSON response
      const jsonResponse: JSONRPCResponse = await response.json();

      if (jsonResponse.error) {
        throw new Error(
          `MCP Error ${jsonResponse.error.code}: ${jsonResponse.error.message}`
        );
      }

      return jsonResponse.result;
    } else if (contentType?.includes('text/event-stream')) {
      // SSE response - we need to parse the stream
      return this.parseSSEResponse(response);
    } else {
      throw new Error(`Unexpected content type: ${contentType}`);
    }
  }

  private async parseSSEResponse(response: Response): Promise<any> {
    if (!response.body) {
      throw new Error('No response body for SSE stream');
    }

    const requestId = this.messageId; // Store the current request ID for matching

    return new Promise((resolve, reject) => {
      const reader = response
        .body!.pipeThrough(new TextDecoderStream())
        .getReader();

      const processStream = async () => {
        try {
          let buffer = '';

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += value;

            // Process line by line
            let lineEnd;
            while ((lineEnd = buffer.indexOf('\n')) !== -1) {
              const line = buffer.slice(0, lineEnd);
              buffer = buffer.slice(lineEnd + 1);

              // Remove \r if present (for \r\n line endings)
              const cleanLine = line.replace(/\r$/, '');

              if (cleanLine.startsWith('data: ')) {
                const data = cleanLine.slice(6);
                try {
                  const jsonResponse: JSONRPCResponse = JSON.parse(data);

                  // Check if this response matches our request
                  if (jsonResponse.id === requestId) {
                    if (jsonResponse.error) {
                      reject(
                        new Error(
                          `MCP Error ${jsonResponse.error.code}: ${jsonResponse.error.message}`
                        )
                      );
                    } else {
                      resolve(jsonResponse.result);
                    }
                    return; // Exit the stream processing
                  }

                  // If it's not our response, it might be a notification
                  // Pass it to the message handler if available
                  // if (this.onmessage && (!jsonResponse.id || jsonResponse.id !== requestId)) {
                  //   this.onmessage(jsonResponse);
                  // }
                } catch (e) {
                  // Ignore parsing errors for non-JSON data lines
                  continue;
                }
              }
            }
          }

          // If we reach here without getting our response, it's an error
          reject(new Error('No matching response received from SSE stream'));
        } catch (error) {
          reject(error);
        } finally {
          try {
            reader.releaseLock();
          } catch (e) {
            // Reader might already be released
          }
        }
      };

      processStream();
    });
  }

  async initialize(): Promise<InitializeResult> {
    // Initialize SSE connection if needed
    if (this.isSSE) {
      await this.initializeSSE();
    }

    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: this.getNextMessageId(),
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: {
          name: 'minimal-mcp-client',
          version: '1.0.0',
        },
      },
    };

    const result = await this.sendRequest(request);

    // Send initialized notification
    await this.sendNotification('notifications/initialized');

    return result;
  }

  private async sendNotification(method: string, params?: any): Promise<void> {
    const notification = {
      jsonrpc: '2.0' as const,
      method,
      params,
    };

    if (this.isSSE && this.sseEndpoint) {
      // Send via SSE POST endpoint (session ID already in URL)
      const headers = new Headers(this.getAuthHeaders());
      headers.set('Content-Type', 'application/json');

      const response = await fetch(this.sseEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(notification),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to send SSE notification: HTTP ${response.status}`
        );
      }
    } else {
      // Send via direct HTTP
      const headers = new Headers(this.getAuthHeaders());

      if (this.sessionId) {
        headers.set('mcp-session-id', this.sessionId);
      }

      const response = await fetch(this.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(notification),
      });

      if (!response.ok) {
        throw new Error(`Failed to send notification: HTTP ${response.status}`);
      }
    }
  }

  async listTools(): Promise<Tool[]> {
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: this.getNextMessageId(),
      method: 'tools/list',
    };

    const result: ListToolsResult = await this.sendRequest(request);
    return result.tools;
  }

  async executeTool(
    name: string,
    args?: Record<string, any>
  ): Promise<ToolExecutionResult> {
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: this.getNextMessageId(),
      method: 'tools/call',
      params: {
        name,
        arguments: args || {},
      },
    };

    const result = await this.sendRequest(request);
    return result;
  }

  async close(): Promise<void> {
    // Clean up pending requests
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();

    // Close EventSource if we have one
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }

    // For SSE connections, we need to abort any ongoing fetch operations
    if (this.isSSE && this.abortController) {
      // console.log('Aborting SSE connection...');
      this.abortController.abort();
    }

    // Attempt to terminate session if we have a session ID
    if (this.sessionId && !this.isSSE) {
      try {
        const headers = new Headers(this.getAuthHeaders());
        headers.set('mcp-session-id', this.sessionId);

        // Add a timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        await fetch(this.url, {
          method: 'DELETE',
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
      } catch (error) {
        // Ignore errors when terminating - server might not support it
        console.warn('Failed to terminate session:', error);
      }
    }
  }
}
