import {
  OPEN_AI_CHAT_COMPLETION_FINISH_REASON,
  OPEN_AI_COMPLETION_FINISH_REASON,
} from '../types';
import { TOGETHER_AI_FINISH_REASON } from './types';

export const transformTogetherAIChatFinishReason = (
  reason: TOGETHER_AI_FINISH_REASON
): OPEN_AI_CHAT_COMPLETION_FINISH_REASON => {
  switch (reason) {
    case TOGETHER_AI_FINISH_REASON.stop:
    case TOGETHER_AI_FINISH_REASON.eos:
      return OPEN_AI_CHAT_COMPLETION_FINISH_REASON.stop;
    case TOGETHER_AI_FINISH_REASON.length:
      return OPEN_AI_CHAT_COMPLETION_FINISH_REASON.length;
    case TOGETHER_AI_FINISH_REASON.tool_calls:
      return OPEN_AI_CHAT_COMPLETION_FINISH_REASON.tool_calls;
    default:
      return OPEN_AI_CHAT_COMPLETION_FINISH_REASON.stop;
  }
};

export const transformTogetherAICompletionFinishReason = (
  reason: TOGETHER_AI_FINISH_REASON
): OPEN_AI_COMPLETION_FINISH_REASON => {
  switch (reason) {
    case TOGETHER_AI_FINISH_REASON.stop:
    case TOGETHER_AI_FINISH_REASON.eos:
      return OPEN_AI_COMPLETION_FINISH_REASON.stop;
    case TOGETHER_AI_FINISH_REASON.length:
      return OPEN_AI_COMPLETION_FINISH_REASON.length;
    default:
      return OPEN_AI_COMPLETION_FINISH_REASON.stop;
  }
};
