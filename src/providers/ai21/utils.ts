import {
  OPEN_AI_CHAT_COMPLETION_FINISH_REASON,
  OPEN_AI_COMPLETION_FINISH_REASON,
} from '../types';
import { AI21_FINISH_REASON } from './types';

export const transformAI21ChatFinishReason = (
  reason: AI21_FINISH_REASON | string
): OPEN_AI_CHAT_COMPLETION_FINISH_REASON => {
  switch (reason) {
    case AI21_FINISH_REASON.stop:
      return OPEN_AI_CHAT_COMPLETION_FINISH_REASON.stop;
    case AI21_FINISH_REASON.length:
      return OPEN_AI_CHAT_COMPLETION_FINISH_REASON.length;
    default:
      return OPEN_AI_CHAT_COMPLETION_FINISH_REASON.stop;
  }
};

export const transformAI21CompletionFinishReason = (
  reason: AI21_FINISH_REASON | string
): OPEN_AI_COMPLETION_FINISH_REASON => {
  switch (reason) {
    case AI21_FINISH_REASON.stop:
      return OPEN_AI_COMPLETION_FINISH_REASON.stop;
    case AI21_FINISH_REASON.length:
      return OPEN_AI_COMPLETION_FINISH_REASON.length;
    default:
      return OPEN_AI_COMPLETION_FINISH_REASON.stop;
  }
};
