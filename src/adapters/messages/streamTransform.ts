/**
 * Stream Transform for Messages API Adapter
 *
 * Transforms Chat Completions SSE chunks to Anthropic Messages API SSE format.
 */

import { randomUUID } from 'crypto';

interface StreamState {
  messageId: string;
  model: string;
  hasStarted: boolean;
  completed: boolean;
  inputTokens: number;
  outputTokens: number;
  contentBlockIndex: number;
  stopReason: string | null;
}

/**
 * Transform a single Chat Completions stream chunk to Messages API stream events
 */
export function transformStreamChunk(
  chunk: string,
  state: StreamState
): string | undefined {
  const trimmed = chunk.trim();

  // Handle [DONE]
  if (trimmed === 'data: [DONE]') {
    if (!state.hasStarted || state.completed) return undefined;
    state.completed = true;

    // Emit message_delta and message_stop
    return [
      `event: message_delta\ndata: ${JSON.stringify({
        type: 'message_delta',
        delta: {
          stop_reason: state.stopReason || 'end_turn',
          stop_sequence: null,
        },
        usage: {
          output_tokens: state.outputTokens,
          input_tokens: state.inputTokens,
        },
      })}\n\n`,
      `event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`,
    ].join('');
  }

  // Skip non-data lines
  if (!trimmed || !trimmed.startsWith('data: ')) return undefined;

  // Parse the chunk
  let parsed: any;
  try {
    parsed = JSON.parse(trimmed.slice(6));
  } catch {
    return undefined;
  }

  const events: string[] = [];

  // Initialize on first chunk
  if (!state.hasStarted) {
    state.hasStarted = true;
    state.messageId = `msg_${randomUUID()}`;
    state.model = parsed.model || '';

    // Emit message_start
    events.push(
      `event: message_start\ndata: ${JSON.stringify({
        type: 'message_start',
        message: {
          id: state.messageId,
          type: 'message',
          role: 'assistant',
          content: [],
          model: state.model,
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: state.inputTokens, output_tokens: 0 },
        },
      })}\n\n`
    );

    // Emit content_block_start for text
    events.push(
      `event: content_block_start\ndata: ${JSON.stringify({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      })}\n\n`
    );
  }

  const delta = parsed.choices?.[0]?.delta;

  // Handle content delta
  if (delta?.content) {
    events.push(
      `event: content_block_delta\ndata: ${JSON.stringify({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: delta.content },
      })}\n\n`
    );
  }

  // Handle tool calls
  if (delta?.tool_calls) {
    for (const tc of delta.tool_calls) {
      // Content block index 0 is reserved for the assistant text block.
      // Tool calls are subsequent blocks starting at index 1.
      const idx = (tc.index ?? 0) + 1;

      if (tc.function?.name) {
        // New tool call - emit content_block_start
        events.push(
          `event: content_block_start\ndata: ${JSON.stringify({
            type: 'content_block_start',
            index: idx,
            content_block: {
              type: 'tool_use',
              id: tc.id || `toolu_${randomUUID()}`,
              name: tc.function.name,
              input: {},
            },
          })}\n\n`
        );
      }

      if (tc.function?.arguments) {
        // Tool arguments delta
        events.push(
          `event: content_block_delta\ndata: ${JSON.stringify({
            type: 'content_block_delta',
            index: idx,
            delta: {
              type: 'input_json_delta',
              partial_json: tc.function.arguments,
            },
          })}\n\n`
        );
      }
    }
  }

  // Track usage
  if (parsed.usage) {
    state.inputTokens = parsed.usage.prompt_tokens || state.inputTokens;
    state.outputTokens = parsed.usage.completion_tokens || state.outputTokens;
  }

  // Track stop reason
  if (parsed.choices?.[0]?.finish_reason) {
    const reason = parsed.choices[0].finish_reason;
    state.stopReason =
      reason === 'tool_calls'
        ? 'tool_use'
        : reason === 'length'
          ? 'max_tokens'
          : 'end_turn';

    // Emit content_block_stop for all blocks
    events.push(
      `event: content_block_stop\ndata: ${JSON.stringify({
        type: 'content_block_stop',
        index: 0,
      })}\n\n`
    );
  }

  return events.length > 0 ? events.join('') : undefined;
}

/**
 * Create initial stream state
 */
export function createStreamState(): StreamState {
  return {
    messageId: '',
    model: '',
    hasStarted: false,
    completed: false,
    inputTokens: 0,
    outputTokens: 0,
    contentBlockIndex: 0,
    stopReason: null,
  };
}
