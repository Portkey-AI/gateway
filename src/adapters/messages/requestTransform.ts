/**
 * Anthropic Messages API → Chat Completions Request Transform
 *
 * Converts Anthropic Messages API requests to Chat Completions format.
 * This allows any provider to accept requests in Anthropic's format.
 */

import { Params, Message, ContentType } from '../../types/requestBody';

/**
 * Transform Anthropic Messages API request to Chat Completions format
 */
export function transformMessagesToChatCompletions(req: any): Params {
  const messages: Message[] = [];

  // Transform system message
  if (req.system) {
    const systemContent =
      typeof req.system === 'string'
        ? req.system
        : req.system.map((block: any) => block.text).join('\n');
    messages.push({ role: 'system', content: systemContent });
  }

  // Transform messages
  for (const msg of req.messages || []) {
    const transformed = transformMessage(msg);
    if (transformed) {
      if (Array.isArray(transformed)) {
        messages.push(...transformed);
      } else {
        messages.push(transformed);
      }
    }
  }

  // Build result
  const result: Params = {
    model: req.model,
    messages,
    max_completion_tokens: req.max_tokens,
  };

  // Map common parameters
  if (req.temperature != null) result.temperature = req.temperature;
  if (req.top_p != null) result.top_p = req.top_p;
  if (req.stream != null) result.stream = req.stream;
  if (req.stop_sequences) result.stop = req.stop_sequences;

  if (result.stream) {
    result.stream_options = {
      include_usage: true,
    };
  }

  // Transform tools
  if (req.tools?.length) {
    result.tools = req.tools.map((tool: any) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.input_schema,
      },
    }));
  }

  // Transform tool_choice
  if (req.tool_choice) {
    if (req.tool_choice.type === 'auto') {
      result.tool_choice = 'auto';
    } else if (req.tool_choice.type === 'any') {
      result.tool_choice = 'required';
    } else if (req.tool_choice.type === 'tool' && req.tool_choice.name) {
      result.tool_choice = {
        type: 'function',
        function: { name: req.tool_choice.name },
      };
    }
  }

  // Transform metadata.user_id
  if (req.metadata?.user_id) {
    result.user = req.metadata.user_id;
  }

  // Transform output_config → response_format + reasoning_effort
  if (req.output_config) {
    if (req.output_config.format?.type === 'json_schema') {
      result.response_format = {
        type: 'json_schema',
        json_schema: req.output_config.format.schema,
      };
    }
    if (req.output_config.effort) {
      result.reasoning_effort = req.output_config.effort;
    }
  }

  return result;
}

/**
 * Transform a single Anthropic message to Chat Completions format
 * Returns an array when tool_result needs to be a separate message
 */
function transformMessage(msg: any): Message | Message[] | null {
  // Simple string content
  if (typeof msg.content === 'string') {
    return { role: msg.role, content: msg.content };
  }

  // Array of content blocks
  if (!Array.isArray(msg.content)) return null;

  const contentParts: ContentType[] = [];
  const toolCalls: any[] = [];
  const toolResults: Message[] = [];

  for (const block of msg.content) {
    switch (block.type) {
      case 'text':
        contentParts.push({ type: 'text', text: block.text || '' });
        break;

      case 'image':
        if (block.source) {
          contentParts.push({
            type: 'image_url',
            image_url: {
              url: `data:${block.source.media_type};base64,${block.source.data}`,
            },
          });
        }
        break;

      case 'tool_use':
        // Assistant's tool call
        if (block.id && block.name) {
          toolCalls.push({
            id: block.id,
            type: 'function',
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input || {}),
            },
          });
        }
        break;

      case 'tool_result':
        // Tool results become separate messages with role: tool
        toolResults.push({
          role: 'tool',
          tool_call_id: block.tool_use_id || '',
          content:
            typeof block.content === 'string'
              ? block.content
              : JSON.stringify(block.content),
        });
        break;
    }
  }

  // Handle tool results (need to return array)
  if (toolResults.length > 0) {
    return toolResults;
  }

  // Handle assistant message with tool calls
  if (toolCalls.length > 0) {
    return {
      role: 'assistant',
      content:
        contentParts.length > 0 && contentParts[0].type === 'text'
          ? (contentParts[0] as any).text
          : null,
      tool_calls: toolCalls,
    };
  }

  // Simple text content
  if (contentParts.length === 1 && contentParts[0].type === 'text') {
    return {
      role: msg.role,
      content: (contentParts[0] as any).text || '',
    };
  }

  // Multimodal content
  return {
    role: msg.role,
    content: contentParts,
  };
}

export default transformMessagesToChatCompletions;
