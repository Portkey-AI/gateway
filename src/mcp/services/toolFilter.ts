/**
 * MCP Gateway Tool Filter
 * Filters tools based on toolkit configuration using glob patterns
 * Validates tool call parameters against fine-grained permission rules
 */

import { logger } from '../utils/logger.js';
import type { Tool, ToolkitConfig, ToolPermission, ParameterRule } from '../types/index.js';

const log = logger.child('toolFilter');

/**
 * Simple glob pattern matching
 * Supports:
 * - * matches any characters (except /)
 * - ** matches any characters (including /)
 * - ? matches single character
 */
function matchGlob(pattern: string, text: string): boolean {
  // Use placeholder for ** to avoid double-replacement issues
  const DOUBLE_STAR_PLACEHOLDER = '\x00DOUBLE_STAR\x00';

  // Escape special regex characters except * and ?
  let regexPattern = pattern
    // Replace ** with placeholder first to avoid double-replacement
    .replace(/\*\*/g, DOUBLE_STAR_PLACEHOLDER)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    // Convert single * to match anything except /
    .replace(/\*/g, '[^/]*')
    // Restore ** placeholder to match anything including /
    .replace(new RegExp(DOUBLE_STAR_PLACEHOLDER, 'g'), '.*')
    // Convert ? to match single character
    .replace(/\?/g, '.');

  // Ensure exact match
  regexPattern = `^${regexPattern}$`;

  try {
    const regex = new RegExp(regexPattern);
    return regex.test(text);
  } catch {
    log.warn('Invalid glob pattern', { pattern });
    return false;
  }
}

/**
 * Check if a tool name matches any of the given patterns
 */
function matchesAnyPattern(toolName: string, patterns: string[]): boolean {
  if (!patterns || patterns.length === 0) {
    return false;
  }

  return patterns.some((pattern) => matchGlob(pattern, toolName));
}

/**
 * Filter tools based on toolkit configuration
 *
 * Rules:
 * 1. If blocked_tools is non-empty and tool matches any blocked pattern, exclude it
 * 2. If allowed_tools is non-empty, tool must match at least one allowed pattern
 * 3. If allowed_tools is empty, all tools are allowed (unless blocked)
 */
export function filterTools(tools: Tool[], toolkit: ToolkitConfig): Tool[] {
  if (!toolkit) {
    return tools;
  }

  const { allowedTools, blockedTools } = toolkit;

  // If no filters, return all tools
  if (
    (!allowedTools || allowedTools.length === 0) &&
    (!blockedTools || blockedTools.length === 0)
  ) {
    return tools;
  }

  return tools.filter((tool) => {
    const toolName = tool.name;

    // Check blocked first - if matches, exclude
    if (blockedTools && blockedTools.length > 0) {
      if (matchesAnyPattern(toolName, blockedTools)) {
        log.debug('Tool blocked by pattern', { toolName, blockedTools });
        return false;
      }
    }

    // If no allowed patterns, allow all (that aren't blocked)
    if (!allowedTools || allowedTools.length === 0) {
      return true;
    }

    // Check if matches any allowed pattern
    const isAllowed = matchesAnyPattern(toolName, allowedTools);
    if (!isAllowed) {
      log.debug('Tool not in allowed patterns', { toolName, allowedTools });
    }
    return isAllowed;
  });
}

/**
 * Validate if a specific tool call is allowed by the toolkit
 */
export function validateToolCall(toolName: string, toolkit: ToolkitConfig | undefined): boolean {
  if (!toolkit) {
    return true;
  }

  const { allowedTools, blockedTools } = toolkit;

  // Check blocked first
  if (blockedTools && blockedTools.length > 0) {
    if (matchesAnyPattern(toolName, blockedTools)) {
      log.debug('Tool call blocked', { toolName });
      return false;
    }
  }

  // If no allowed patterns, allow all (that aren't blocked)
  if (!allowedTools || allowedTools.length === 0) {
    return true;
  }

  // Check if matches any allowed pattern
  return matchesAnyPattern(toolName, allowedTools);
}

/**
 * Get list of tools that would be blocked by the toolkit
 * Useful for debugging/admin purposes
 */
export function getBlockedTools(tools: Tool[], toolkit: ToolkitConfig): Tool[] {
  const allowed = filterTools(tools, toolkit);
  const allowedNames = new Set(allowed.map((t) => t.name));
  return tools.filter((t) => !allowedNames.has(t.name));
}

/**
 * Get filtering stats for a toolkit
 */
export function getFilterStats(
  tools: Tool[],
  toolkit: ToolkitConfig
): {
  totalTools: number;
  allowedTools: number;
  blockedTools: number;
  filterPatterns: {
    allowed: string[];
    blocked: string[];
  };
} {
  const filtered = filterTools(tools, toolkit);
  return {
    totalTools: tools.length,
    allowedTools: filtered.length,
    blockedTools: tools.length - filtered.length,
    filterPatterns: {
      allowed: toolkit.allowedTools || [],
      blocked: toolkit.blockedTools || [],
    },
  };
}

/**
 * Validation result for parameter checks
 */
export interface ParameterValidationResult {
  valid: boolean;
  error?: string;
  paramName?: string;
}

/**
 * Validate a single parameter value against its rules
 */
function validateParameterValue(
  paramName: string,
  value: unknown,
  rules: ParameterRule
): ParameterValidationResult {
  // Handle string values
  if (typeof value === 'string') {
    // Check pattern
    if (rules.pattern) {
      try {
        const regex = new RegExp(rules.pattern);
        if (!regex.test(value)) {
          return {
            valid: false,
            error: `Parameter '${paramName}' does not match required pattern`,
            paramName,
          };
        }
      } catch (e) {
        log.warn('Invalid regex pattern in parameter rule', { paramName, pattern: rules.pattern });
      }
    }

    // Check length constraints
    if (rules.maxLength !== undefined && value.length > rules.maxLength) {
      return {
        valid: false,
        error: `Parameter '${paramName}' exceeds maximum length of ${rules.maxLength}`,
        paramName,
      };
    }

    if (rules.minLength !== undefined && value.length < rules.minLength) {
      return {
        valid: false,
        error: `Parameter '${paramName}' is shorter than minimum length of ${rules.minLength}`,
        paramName,
      };
    }

    // Check allowed values
    if (rules.allowedValues && rules.allowedValues.length > 0) {
      if (!rules.allowedValues.includes(value)) {
        return {
          valid: false,
          error: `Parameter '${paramName}' value is not in allowed list`,
          paramName,
        };
      }
    }

    // Check blocked values
    if (rules.blockedValues && rules.blockedValues.length > 0) {
      if (rules.blockedValues.includes(value)) {
        return {
          valid: false,
          error: `Parameter '${paramName}' value is blocked`,
          paramName,
        };
      }
    }
  }

  // Handle number values
  if (typeof value === 'number') {
    if (rules.maximum !== undefined && value > rules.maximum) {
      return {
        valid: false,
        error: `Parameter '${paramName}' exceeds maximum value of ${rules.maximum}`,
        paramName,
      };
    }

    if (rules.minimum !== undefined && value < rules.minimum) {
      return {
        valid: false,
        error: `Parameter '${paramName}' is below minimum value of ${rules.minimum}`,
        paramName,
      };
    }
  }

  return { valid: true };
}

/**
 * Validate tool call parameters against fine-grained permission rules
 */
export function validateToolCallParams(
  toolName: string,
  params: Record<string, unknown> | undefined,
  toolkit: ToolkitConfig | undefined
): ParameterValidationResult {
  if (!toolkit?.toolPermissions) {
    return { valid: true };
  }

  const permission = toolkit.toolPermissions[toolName];
  if (!permission) {
    return { valid: true };
  }

  // Check if tool is explicitly disallowed
  if (permission.allowed === false) {
    return {
      valid: false,
      error: `Tool '${toolName}' is not allowed`,
    };
  }

  // No parameter rules, allow
  if (!permission.parameters || !params) {
    return { valid: true };
  }

  // Validate each parameter with rules
  for (const [paramName, rules] of Object.entries(permission.parameters)) {
    const value = params[paramName];

    // Skip if parameter not provided (required check is separate)
    if (value === undefined) {
      continue;
    }

    const result = validateParameterValue(paramName, value, rules);
    if (!result.valid) {
      log.warn('Parameter validation failed', {
        toolName,
        paramName,
        error: result.error,
      });
      return result;
    }
  }

  return { valid: true };
}

/**
 * Check if a tool has fine-grained permission rules
 */
export function hasToolPermission(toolName: string, toolkit: ToolkitConfig | undefined): boolean {
  if (!toolkit?.toolPermissions) {
    return false;
  }
  return toolName in toolkit.toolPermissions;
}

/**
 * Get tool permission for a specific tool
 */
export function getToolPermission(
  toolName: string,
  toolkit: ToolkitConfig | undefined
): ToolPermission | undefined {
  if (!toolkit?.toolPermissions) {
    return undefined;
  }
  return toolkit.toolPermissions[toolName];
}

/**
 * Create a tool filter function bound to a specific toolkit
 */
export function createToolFilter(toolkit: ToolkitConfig | undefined) {
  return {
    filter: (tools: Tool[]) => (toolkit ? filterTools(tools, toolkit) : tools),
    validate: (toolName: string) => validateToolCall(toolName, toolkit),
    validateParams: (toolName: string, params: Record<string, unknown> | undefined) =>
      validateToolCallParams(toolName, params, toolkit),
    isEnabled: () => !!toolkit,
    getConfig: () => toolkit,
    hasPermission: (toolName: string) => hasToolPermission(toolName, toolkit),
    getPermission: (toolName: string) => getToolPermission(toolName, toolkit),
  };
}
