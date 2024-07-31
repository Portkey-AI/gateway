import {
  OPEN_AI_CHAT_COMPLETION_FINISH_REASON,
  OPEN_AI_COMPLETION_FINISH_REASON,
} from '../types';
import { ANTHROPIC_STOP_REASON } from './types';

// this converts the anthropic stop_reason to an openai finish_reason

export const transformAnthropicChatStopReason = (
  stopReason: ANTHROPIC_STOP_REASON | string
): OPEN_AI_CHAT_COMPLETION_FINISH_REASON => {
  switch (stopReason) {
    case ANTHROPIC_STOP_REASON.stop_sequence:
    case ANTHROPIC_STOP_REASON.end_turn:
      return OPEN_AI_CHAT_COMPLETION_FINISH_REASON.stop;
    case ANTHROPIC_STOP_REASON.tool_use:
      return OPEN_AI_CHAT_COMPLETION_FINISH_REASON.tool_calls;
    case ANTHROPIC_STOP_REASON.max_tokens:
      return OPEN_AI_CHAT_COMPLETION_FINISH_REASON.length;
    default:
      return OPEN_AI_CHAT_COMPLETION_FINISH_REASON.stop;
  }
};
// finish_reason may be null for stream chunks

export const transformAnthropicChatStreamChunkStopReason = (
  stopReason?: ANTHROPIC_STOP_REASON | string | null
): OPEN_AI_CHAT_COMPLETION_FINISH_REASON | null => {
  if (!stopReason) return null;
  return transformAnthropicChatStopReason(stopReason);
};
export const transformAnthropicCompletionFinishReason = (
  stopReason: ANTHROPIC_STOP_REASON | string
): OPEN_AI_COMPLETION_FINISH_REASON => {
  switch (stopReason) {
    case ANTHROPIC_STOP_REASON.stop_sequence:
    case ANTHROPIC_STOP_REASON.end_turn:
      return OPEN_AI_COMPLETION_FINISH_REASON.stop;
    case ANTHROPIC_STOP_REASON.tool_use:
      return OPEN_AI_COMPLETION_FINISH_REASON.length;
    default:
      return OPEN_AI_COMPLETION_FINISH_REASON.stop;
  }
};

export const transformAnthropicCompletionStreamChunkFinishReason = (
  stopReason?: ANTHROPIC_STOP_REASON | string | null
): OPEN_AI_COMPLETION_FINISH_REASON | null => {
  if (!stopReason) return null;
  return transformAnthropicCompletionFinishReason(stopReason);
};
