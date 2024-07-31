import { OPEN_AI_CHAT_COMPLETION_FINISH_REASON } from '../types';
import { MISTRAL_AI_CHAT_FINISH_REASON } from './types';

export const transformMistralChatFinishReason = (
  reason: MISTRAL_AI_CHAT_FINISH_REASON | string
): OPEN_AI_CHAT_COMPLETION_FINISH_REASON => {
  switch (reason) {
    case MISTRAL_AI_CHAT_FINISH_REASON.stop:
    case MISTRAL_AI_CHAT_FINISH_REASON.error:
      return OPEN_AI_CHAT_COMPLETION_FINISH_REASON.stop;
    case MISTRAL_AI_CHAT_FINISH_REASON.length:
    case MISTRAL_AI_CHAT_FINISH_REASON.model_length:
      return OPEN_AI_CHAT_COMPLETION_FINISH_REASON.length;
    case MISTRAL_AI_CHAT_FINISH_REASON.tool_calls:
      return OPEN_AI_CHAT_COMPLETION_FINISH_REASON.tool_calls;
    default:
      return OPEN_AI_CHAT_COMPLETION_FINISH_REASON.stop;
  }
};

export const transformMistralChatStreamFinishReason = (
  reason?: MISTRAL_AI_CHAT_FINISH_REASON | string | null
): OPEN_AI_CHAT_COMPLETION_FINISH_REASON | null => {
  if (!reason) return null;
  return transformMistralChatFinishReason(reason);
};
