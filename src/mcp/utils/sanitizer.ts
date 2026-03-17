/**
 * MCP Gateway Tool Metadata Sanitizer
 * Prevents Tool Poisoning Attacks (TPA) by sanitizing tool metadata from upstream servers
 *
 * MCPSecBench identifies TPA as a primary attack vector where malicious instructions
 * are injected via tool descriptions and metadata.
 */

import { logger } from './logger.js';
import type { Tool } from '../types/index.js';

const log = logger.child('sanitizer');

// Maximum lengths for sanitized fields
const MAX_TOOL_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_PROPERTY_DESCRIPTION_LENGTH = 500;
const MAX_SCHEMA_DEPTH = 5;

// Patterns that indicate prompt injection attempts
const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  // Llama/Mistral style
  /\[INST\][\s\S]*?\[\/INST\]/gi,
  /\[SYS\][\s\S]*?\[\/SYS\]/gi,
  /<<SYS>>[\s\S]*?<<\/SYS>>/gi,

  // ChatML style
  /<\|im_start\|>[\s\S]*?<\|im_end\|>/gi,
  /<\|system\|>[\s\S]*?<\|end\|>/gi,
  /<\|user\|>[\s\S]*?<\|end\|>/gi,
  /<\|assistant\|>[\s\S]*?<\|end\|>/gi,
  /<\|.*?\|>/g,

  // Claude style
  /\bHuman:\s/gi,
  /\bAssistant:\s/gi,
  /\bSystem:\s/gi,

  // OpenAI/GPT style
  /###\s*(Instruction|System|User|Assistant|Response)[:\s]/gi,
  /\[System Message\]/gi,
  /\[User Message\]/gi,

  // Role markers
  /^\s*role\s*:\s*(system|user|assistant)/gim,

  // Common injection attempts
  /ignore (all )?(previous|prior|above) instructions/gi,
  /disregard (all )?(previous|prior|above)/gi,
  /forget (all )?(previous|prior|above)/gi,
  /new instructions:/gi,
  /override (system|instructions)/gi,
  /you are now/gi,
  /act as if/gi,
  /pretend (to be|you are)/gi,
  /simulate being/gi,

  // Prompt leaking attempts
  /what (are|is) your (system )?(prompt|instructions)/gi,
  /repeat (your )?instructions/gi,
  /show (your )?(system )?(prompt|message)/gi,

  // Base64/encoded content that might hide instructions
  /data:text\/[^;]+;base64,[A-Za-z0-9+/=]{50,}/gi,

  // XML/HTML that might contain hidden instructions
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  /<!--[\s\S]*?-->/g,

  // Markdown code blocks with suspicious content
  /```(system|prompt|instruction)[\s\S]*?```/gi,
];

// Characters allowed in tool names (alphanumeric, underscore, hyphen, dot, colon)
const VALID_TOOL_NAME_CHARS = /^[a-zA-Z0-9_\-.:]+$/;

/**
 * Sanitize a tool name to prevent injection via name field
 */
export function sanitizeToolName(name: string): string {
  if (!name || typeof name !== 'string') {
    return 'unnamed_tool';
  }

  // Replace invalid characters with underscore
  let sanitized = name.replace(/[^a-zA-Z0-9_\-.:]/g, '_');

  // Collapse multiple underscores
  sanitized = sanitized.replace(/_+/g, '_');

  // Remove leading/trailing underscores
  sanitized = sanitized.replace(/^_+|_+$/g, '');

  // Ensure it starts with a letter or underscore (valid identifier)
  if (!/^[a-zA-Z_]/.test(sanitized)) {
    sanitized = 'tool_' + sanitized;
  }

  // Truncate to max length
  if (sanitized.length > MAX_TOOL_NAME_LENGTH) {
    sanitized = sanitized.slice(0, MAX_TOOL_NAME_LENGTH);
  }

  // Ensure non-empty
  if (!sanitized) {
    sanitized = 'unnamed_tool';
  }

  return sanitized;
}

/**
 * Sanitize a text description by removing prompt injection patterns
 */
export function sanitizeDescription(desc: string | undefined): string | undefined {
  if (!desc || typeof desc !== 'string') {
    return desc;
  }

  let sanitized = desc;

  // Track if we detected injection attempts
  let injectionDetected = false;

  // Remove all prompt injection patterns
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    const before = sanitized;
    sanitized = sanitized.replace(pattern, ' ');
    if (sanitized !== before) {
      injectionDetected = true;
    }
  }

  // Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  // Truncate to max length
  if (sanitized.length > MAX_DESCRIPTION_LENGTH) {
    sanitized = sanitized.slice(0, MAX_DESCRIPTION_LENGTH) + '...';
  }

  // Log if injection was detected
  if (injectionDetected) {
    log.warn('Prompt injection patterns detected and removed from tool description', {
      originalLength: desc.length,
      sanitizedLength: sanitized.length,
    });
  }

  return sanitized || undefined;
}

/**
 * Sanitize an input schema recursively
 */
export function sanitizeSchema(
  schema: Tool['inputSchema'],
  depth: number = 0
): Tool['inputSchema'] {
  if (!schema || typeof schema !== 'object') {
    return { type: 'object' };
  }

  // Prevent infinite recursion
  if (depth > MAX_SCHEMA_DEPTH) {
    log.warn('Schema depth exceeded maximum, truncating', { maxDepth: MAX_SCHEMA_DEPTH });
    return { type: 'object' };
  }

  const sanitized: Tool['inputSchema'] = {
    type: 'object',
  };

  // Sanitize properties
  if (schema.properties && typeof schema.properties === 'object') {
    const sanitizedProperties: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(schema.properties)) {
      // Sanitize property key
      const sanitizedKey = sanitizeToolName(key);

      if (value && typeof value === 'object') {
        const propValue = value as Record<string, unknown>;
        const sanitizedProp: Record<string, unknown> = {};

        // Copy allowed fields
        if ('type' in propValue) {
          sanitizedProp.type = propValue.type;
        }

        // Sanitize description
        if ('description' in propValue && typeof propValue.description === 'string') {
          const sanitizedDesc = sanitizeDescription(propValue.description);
          if (sanitizedDesc) {
            sanitizedProp.description =
              sanitizedDesc.length > MAX_PROPERTY_DESCRIPTION_LENGTH
                ? sanitizedDesc.slice(0, MAX_PROPERTY_DESCRIPTION_LENGTH) + '...'
                : sanitizedDesc;
          }
        }

        // Copy safe primitive fields
        for (const field of ['enum', 'default', 'minimum', 'maximum', 'minLength', 'maxLength']) {
          if (field in propValue) {
            sanitizedProp[field] = propValue[field];
          }
        }

        // Recursively sanitize nested objects/arrays
        if (propValue.type === 'object' && propValue.properties) {
          const nestedSchema = sanitizeSchema(propValue as Tool['inputSchema'], depth + 1);
          sanitizedProp.properties = nestedSchema.properties;
        }

        if (propValue.type === 'array' && propValue.items) {
          sanitizedProp.items = sanitizeSchemaItem(propValue.items, depth + 1);
        }

        sanitizedProperties[sanitizedKey] = sanitizedProp;
      }
    }

    sanitized.properties = sanitizedProperties;
  }

  // Copy required array (sanitize names)
  if (schema.required && Array.isArray(schema.required)) {
    sanitized.required = schema.required
      .filter((r): r is string => typeof r === 'string')
      .map((r) => sanitizeToolName(r));
  }

  return sanitized;
}

/**
 * Sanitize a schema item (for array items)
 */
function sanitizeSchemaItem(item: unknown, depth: number): unknown {
  if (!item || typeof item !== 'object') {
    return item;
  }

  const itemObj = item as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  if ('type' in itemObj) {
    sanitized.type = itemObj.type;
  }

  if ('description' in itemObj && typeof itemObj.description === 'string') {
    sanitized.description = sanitizeDescription(itemObj.description);
  }

  if (itemObj.type === 'object' && itemObj.properties) {
    const nestedSchema = sanitizeSchema(itemObj as Tool['inputSchema'], depth);
    sanitized.properties = nestedSchema.properties;
  }

  return sanitized;
}

/**
 * Sanitize complete tool metadata
 */
export function sanitizeToolMetadata(tool: Tool): Tool {
  const originalName = tool.name;
  const sanitizedName = sanitizeToolName(tool.name);
  const sanitizedDescription = sanitizeDescription(tool.description);
  const sanitizedSchema = sanitizeSchema(tool.inputSchema);

  // Log if tool name was changed
  if (originalName !== sanitizedName) {
    log.info('Tool name sanitized', {
      original: originalName,
      sanitized: sanitizedName,
    });
  }

  return {
    name: sanitizedName,
    description: sanitizedDescription,
    inputSchema: sanitizedSchema,
  };
}

/**
 * Sanitize an array of tools
 */
export function sanitizeTools(tools: Tool[]): Tool[] {
  return tools.map(sanitizeToolMetadata);
}

/**
 * Check if a string contains potential injection patterns (for logging/alerting)
 */
export function detectInjectionPatterns(text: string): {
  detected: boolean;
  patterns: string[];
} {
  if (!text || typeof text !== 'string') {
    return { detected: false, patterns: [] };
  }

  const detectedPatterns: string[] = [];

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      detectedPatterns.push(pattern.source.slice(0, 50));
    }
  }

  return {
    detected: detectedPatterns.length > 0,
    patterns: detectedPatterns,
  };
}
