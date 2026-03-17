/**
 * MCP Gateway Logger
 * Re-exports from shared logger for consistent logging across the gateway
 */

import {
  logger as sharedLogger,
  createLogger as sharedCreateLogger,
} from '../../shared/utils/logger.js';

// Create MCP-prefixed logger
const mcpLogger = sharedCreateLogger('mcp');

// Compatible interface with child() method
export const logger = {
  error: (message: string, data?: any) => mcpLogger.error(message, data),
  warn: (message: string, data?: any) => mcpLogger.warn(message, data),
  info: (message: string, data?: any) => mcpLogger.info(message, data),
  debug: (message: string, data?: any) => mcpLogger.debug(message, data),
  child: (prefix: string) => {
    const childLogger = mcpLogger.createChild(prefix);
    return {
      error: (message: string, data?: any) => childLogger.error(message, data),
      warn: (message: string, data?: any) => childLogger.warn(message, data),
      info: (message: string, data?: any) => childLogger.info(message, data),
      debug: (message: string, data?: any) => childLogger.debug(message, data),
      child: (subPrefix: string) => {
        const subChild = childLogger.createChild(subPrefix);
        return {
          error: (message: string, data?: any) => subChild.error(message, data),
          warn: (message: string, data?: any) => subChild.warn(message, data),
          info: (message: string, data?: any) => subChild.info(message, data),
          debug: (message: string, data?: any) => subChild.debug(message, data),
        };
      },
    };
  },
};

// Factory function for creating child loggers
export function createLogger(prefix: string) {
  return logger.child(prefix);
}
