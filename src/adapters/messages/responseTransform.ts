/**
 * Chat Completions → Anthropic Messages API Response Transform
 *
 * Converts Chat Completions responses to Anthropic Messages API format.
 */

import { ChatCompletionResponse, ErrorResponse } from '../../providers/types';
import {
  MessagesResponse,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ThinkingBlock,
  Usage,
  ANTHROPIC_STOP_REASON,
} from '../../types/messagesResponse';
import { randomUUID } from 'crypto';
import { logger } from '../../apm';

// Map Chat Completions finish_reason to Anthropic stop_reason
const STOP_REASON_MAP: Record<string, ANTHROPIC_STOP_REASON> = {
  stop: ANTHROPIC_STOP_REASON.end_turn,
  end_turn: ANTHROPIC_STOP_REASON.end_turn,
  length: ANTHROPIC_STOP_REASON.max_tokens,
  max_tokens: ANTHROPIC_STOP_REASON.max_tokens,
  tool_calls: ANTHROPIC_STOP_REASON.tool_use,
  function_call: ANTHROPIC_STOP_REASON.tool_use,
  content_filter: ANTHROPIC_STOP_REASON.end_turn,
};

/**
 * Transform Chat Completions response to Anthropic Messages API format
 */
export function transformChatCompletionsToMessages(
  response: ChatCompletionResponse | ErrorResponse,
  responseStatus: number,
  provider: string
): MessagesResponse | ErrorResponse {
  // Pass through errors
  if ('error' in response) return response;
  if (responseStatus !== 200) {
    return {
      error: {
        message: 'Request failed',
        type: 'api_error',
        param: null,
        code: null,
      },
      provider,
    } as ErrorResponse;
  }

  const content: ContentBlock[] = [];
  let stopReason: ANTHROPIC_STOP_REASON | null = null;

  // Process choices
  for (const choice of response.choices || []) {
    const msg = choice.message as any;
    stopReason =
      STOP_REASON_MAP[choice.finish_reason] || ANTHROPIC_STOP_REASON.end_turn;

    // Handle thinking/reasoning from content_blocks (non-standard extension)
    if (msg.content_blocks?.length) {
      for (const block of msg.content_blocks) {
        if (block.thinking || block.type === 'thinking') {
          content.push({
            type: 'thinking',
            thinking: block.thinking || block.text || '',
            signature: '',
          } as ThinkingBlock);
        }
      }
    }

    // Handle tool calls
    if (msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        if (tc.type === 'function') {
          let input: Record<string, unknown> = {};
          try {
            const parsed = JSON.parse(tc.function.arguments || '{}');
            input = parsed !== null && typeof parsed === 'object' ? parsed : {};
          } catch (err) {
            logger.warn({
              message: 'Failed to parse tool arguments as JSON',
              provider,
              toolName: tc.function?.name,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          content.push({
            type: 'tool_use',
            id: tc.id || `toolu_${randomUUID()}`,
            name: tc.function.name,
            input,
          } as ToolUseBlock);
        }
      }
    }

    // Handle text content
    const textContent = msg.content;
    if (textContent != null) {
      const text =
        typeof textContent === 'string'
          ? textContent
          : Array.isArray(textContent)
            ? textContent.map((c: any) => c.text || '').join('')
            : String(textContent);

      if (text) {
        content.push({
          type: 'text',
          text,
        } as TextBlock);
      }
    }
  }

  // Build usage
  const chatUsage = response.usage;
  const usage: Usage = {
    input_tokens: chatUsage?.prompt_tokens || 0,
    output_tokens: chatUsage?.completion_tokens || 0,
  };

  return {
    id: response.id || `msg_${randomUUID()}`,
    type: 'message',
    role: 'assistant',
    content,
    model: response.model,
    stop_reason: stopReason,
    stop_sequence: null,
    usage,
  };
}

export default transformChatCompletionsToMessages;
