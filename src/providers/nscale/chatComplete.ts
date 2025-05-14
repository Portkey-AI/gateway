import { ParameterConfig } from '../types';
import { chatCompleteParams } from '../open-ai-base';

interface ChatChoice {
  index: number;
  message: {
    role: string;
    content: string;
  };
  finish_reason: string | null;
}

interface StreamChoice {
  index: number;
  delta: {
    role?: string;
    content?: string;
  };
  finish_reason: string | null;
}

export const NscaleChatCompleteConfig = chatCompleteParams([
  'functions',
  'function_call',
  'user',
  'seed',
  'tools',
  'tool_choice',
  'stream_options',
]);

export const NscaleChatCompleteResponseTransform = (response: any) => {
  return {
    id: response.id,
    object: 'chat.completion',
    created: Date.now(),
    model: response.model,
    choices: response.choices.map((choice: ChatChoice) => ({
      index: choice.index,
      message: choice.message,
      finish_reason: choice.finish_reason,
    })),
    usage: response.usage,
  };
};

export const NscaleChatCompleteStreamChunkTransform = (chunk: any) => {
  return {
    id: chunk.id,
    object: 'chat.completion.chunk',
    created: Date.now(),
    model: chunk.model,
    choices: chunk.choices.map((choice: StreamChoice) => ({
      index: choice.index,
      delta: choice.delta,
      finish_reason: choice.finish_reason,
    })),
  };
};
