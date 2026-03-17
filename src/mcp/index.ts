/**
 * MCP Gateway Module Entry Point
 *
 * This module provides MCP (Model Context Protocol) proxy functionality for StringCost.
 * It is designed to be completely self-contained within this directory to survive
 * upstream Portkey updates.
 *
 * Usage:
 * ```typescript
 * import mcpApp from './mcp';
 * app.route('/mcp', mcpApp);
 * ```
 *
 * Or as app extension middleware:
 * ```typescript
 * import { mcpMiddleware } from './mcp';
 * mcpMiddleware()(app);
 * ```
 */

import mcpApp from './mcp-app.js';

// Re-export the main app
export default mcpApp;
export { mcpApp };

// Export as app extension middleware for compatibility with middleware loader
export const middleware = () => {
  return (mainApp: any) => {
    mainApp.route('/mcp', mcpApp);
  };
};

export const metadata = {
  name: 'mcp-gateway',
  appExtension: true,
  description: 'MCP Gateway for tool proxying and filtering',
};

// Export types for external use
export type {
  ServerConfig,
  ServerTokens,
  ToolkitConfig,
  TransportType,
  AuthType,
  SessionInfo,
  SessionState,
  MCPContext,
  Tool,
  ToolListResponse,
  JSONRPCRequest,
  JSONRPCResponse,
} from './types/index.js';

// Export constants for external use
export { MCP_HEADERS, TIMEOUTS, MCP_PROTOCOL, ERROR_MESSAGES } from './constants/index.js';

// Export services for advanced use cases
export { getSessionManager, MCPSession } from './services/mcpSession.js';
export { getControlPlane, ControlPlane } from './middleware/controlPlane.js';
export { filterTools, validateToolCall, createToolFilter } from './services/toolFilter.js';
export { getCache, closeCache } from './utils/cache.js';
export { logger, createLogger } from './utils/logger.js';
