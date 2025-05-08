import { ParameterConfig } from '../types';

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

export const NscaleChatCompleteConfig: { [key: string]: ParameterConfig } = {
  messages: {
    param: 'messages',
    required: true,
  },
  model: {
    param: 'model',
    required: true,
  },
  max_tokens: {
    param: 'max_tokens',
  },
  n: {
    param: 'n',
  },
  temperature: {
    param: 'temperature',
    default: 1,
  },
  top_p: {
    param: 'top_p',
  },
  stream: {
    param: 'stream',
  },
  logprobs: {
    param: 'logprobs',
  },
  top_logprobs: {
    param: 'top_logprobs',
  },
  frequency_penalty: {
    param: 'frequency_penalty',
  },
  presence_penalty: {
    param: 'presence_penalty',
  },
  response_format: {
    param: 'response_format',
  },
  stop: {
    param: 'stop',
  },
  logit_bias: {
    param: 'logit_bias',
  },
};

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
