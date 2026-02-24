/**
 * Responses API → Chat Completions Request Transform
 *
 * Converts OpenAI Responses API requests to Chat Completions format.
 * Optimized for minimal allocations and fast execution.
 */

import { Params, Message, ContentType } from '../../types/requestBody';

// Role mapping (inline for performance)
const ROLE_MAP: Record<string, 'system' | 'user' | 'assistant' | 'tool'> = {
  developer: 'system',
  system: 'system',
  user: 'user',
  assistant: 'assistant',
  tool: 'tool',
};

/**
 * Transform Responses API request to Chat Completions format
 */
export function transformResponsesToChatCompletions(req: any): Params {
  const messages: Message[] = [];

  // Add system message from instructions
  if (req.instructions) {
    messages.push({ role: 'system', content: req.instructions });
  }

  // Transform input to messages
  if (typeof req.input === 'string') {
    messages.push({ role: 'user', content: req.input });
  } else if (Array.isArray(req.input)) {
    for (const item of req.input) {
      const msg = transformInputItem(item);
      if (msg) messages.push(msg);
    }
  }

  // Build result with only defined values (avoid undefined properties)
  const result: Params = { model: req.model, messages };

  // Direct property mapping (only set if defined and not null)
  if (req.temperature != null) result.temperature = req.temperature;
  if (req.top_p != null) result.top_p = req.top_p;
  // Only set max_tokens if explicitly provided - provider configs handle defaults (e.g., Anthropic: 64000)
  if (req.max_output_tokens != null)
    result.max_completion_tokens = req.max_output_tokens;
  if (req.stream != null) result.stream = req.stream;
  if (req.user) result.user = req.user;
  if (req.parallel_tool_calls != null)
    result.parallel_tool_calls = req.parallel_tool_calls;
  if (req.metadata) result.metadata = req.metadata;

  // Transform tools (only function type supported)
  if (req.tools?.length) {
    const tools = [];
    for (const t of req.tools) {
      if (t.type === 'function') {
        const tool: any = {
          type: 'function' as const,
          function: {
            name: t.name,
            description: t.description || '',
            parameters: t.parameters,
          },
        };
        // Preserve cache_control for prompt caching (Anthropic, etc.)
        if (t.cache_control) tool.cache_control = t.cache_control;
        tools.push(tool);
      }
    }
    if (tools.length) result.tools = tools;
  }

  // Transform tool_choice
  if (req.tool_choice) {
    if (typeof req.tool_choice === 'string') {
      result.tool_choice = req.tool_choice;
    } else if (req.tool_choice.type === 'function' && req.tool_choice.name) {
      result.tool_choice = {
        type: 'function',
        function: { name: req.tool_choice.name },
      };
    }
  }

  // Transform response format (text.format)
  if (req.text?.format) {
    const fmt = req.text.format;
    if (fmt.type === 'json_schema') {
      result.response_format = {
        type: 'json_schema',
        json_schema: {
          name: fmt.name || 'response',
          schema: fmt.schema,
          strict: fmt.strict,
        },
      };
    } else if (fmt.type === 'json_object') {
      result.response_format = { type: 'json_object' };
    }
  }

  // Reasoning effort - maps to reasoning_effort which providers handle:
  // - OpenAI/Azure: passthrough as reasoning_effort (o-series models)
  // - Anthropic: mapped to output_config.effort (Opus 4.5+)
  // - Google/Vertex: mapped to thinking_config/thinkingConfig
  if (req.reasoning?.effort) {
    result.reasoning_effort = req.reasoning.effort;
  }

  // Pass through provider-specific thinking parameter (Anthropic extended thinking)
  // This allows users to enable extended thinking on Claude models
  if (req.thinking) {
    (result as any).thinking = req.thinking;
  }

  // Logprobs settings
  if (req.top_logprobs != null) result.top_logprobs = req.top_logprobs;

  return result;
}

/**
 * Transform a single input item to a Message
 */
function transformInputItem(item: any): Message | null {
  // Simple message format { role, content }
  if (
    item.role &&
    item.content !== undefined &&
    item.type !== 'function_call'
  ) {
    return {
      role: ROLE_MAP[item.role] || 'user',
      content: transformContent(item.content),
    };
  }

  // Typed items
  switch (item.type) {
    case 'message':
      if (item.role && item.content !== undefined) {
        return {
          role: ROLE_MAP[item.role] || 'user',
          content: transformContent(item.content),
        };
      }
      break;

    case 'function_call':
      if (item.name && item.arguments !== undefined) {
        return {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: item.call_id || item.id,
              type: 'function',
              function: { name: item.name, arguments: item.arguments },
            },
          ],
        };
      }
      break;

    case 'function_call_output':
      if (item.call_id && item.output !== undefined) {
        return {
          role: 'tool',
          tool_call_id: item.call_id,
          content: item.output,
        };
      }
      break;
  }

  return null;
}

/**
 * Transform message content (string or array of parts)
 */
function transformContent(content: any): string | ContentType[] {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  // Check if we can return a simple string
  if (content.length === 1) {
    const p = content[0];
    if (p.type === 'input_text' || p.type === 'output_text')
      return p.text || '';
    if (p.type === 'text') return p.text || '';
  }

  // Build content array
  const parts: ContentType[] = [];
  for (const p of content) {
    if (
      p.type === 'input_text' ||
      p.type === 'output_text' ||
      p.type === 'text'
    ) {
      const part: ContentType = { type: 'text', text: p.text || '' };
      // Preserve cache_control for prompt caching (Anthropic, etc.)
      if (p.cache_control) part.cache_control = p.cache_control;
      parts.push(part);
    } else if (p.type === 'input_image' && p.image_url) {
      const part: ContentType = {
        type: 'image_url',
        image_url: { url: p.image_url, detail: p.detail },
      };
      if (p.cache_control) part.cache_control = p.cache_control;
      parts.push(part);
    } else if (p.type === 'input_file') {
      // Transform input_file to Chat Completions file format
      // file_data should be a data URL (e.g., "data:application/pdf;base64,...")
      const part: any = {
        type: 'file',
        file: {
          filename: p.filename,
          file_data: p.file_data,
          file_id: p.file_id,
        },
      };
      if (p.cache_control) part.cache_control = p.cache_control;
      parts.push(part);
    }
  }

  return parts.length ? parts : '';
}

export default transformResponsesToChatCompletions;
