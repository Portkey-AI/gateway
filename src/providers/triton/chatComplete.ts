import { TRITON } from '../../globals';
import { Params } from '../../types/requestBody';
import {
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';
import { generateInvalidProviderResponseError } from '../utils';
import { TritonOpenAIErrorResponseTransform } from './utils';

// Triton's OpenAI frontend rejects unknown fields, so only parameters that
// endpoint accepts are mapped.
export const TritonChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
  },
  messages: {
    param: 'messages',
    required: true,
    transform: (params: Params) => {
      return params.messages?.map((message) => {
        if (message.role === 'developer') return { ...message, role: 'system' };
        return message;
      });
    },
  },
  frequency_penalty: {
    param: 'frequency_penalty',
    min: -2,
    max: 2,
  },
  presence_penalty: {
    param: 'presence_penalty',
    min: -2,
    max: 2,
  },
  logit_bias: {
    param: 'logit_bias',
  },
  logprobs: {
    param: 'logprobs',
  },
  top_logprobs: {
    param: 'top_logprobs',
  },
  max_tokens: {
    param: 'max_tokens',
    min: 0,
  },
  max_completion_tokens: {
    param: 'max_completion_tokens',
    min: 0,
  },
  min_tokens: {
    param: 'min_tokens',
    min: 0,
  },
  n: {
    param: 'n',
    min: 1,
  },
  response_format: {
    param: 'response_format',
  },
  seed: {
    param: 'seed',
  },
  stop: {
    param: 'stop',
  },
  stream: {
    param: 'stream',
  },
  stream_options: {
    param: 'stream_options',
  },
  temperature: {
    param: 'temperature',
    min: 0,
    max: 2,
  },
  top_p: {
    param: 'top_p',
    min: 0,
    max: 1,
  },
  tools: {
    param: 'tools',
  },
  tool_choice: {
    param: 'tool_choice',
  },
  user: {
    param: 'user',
  },
  function_call: {
    param: 'function_call',
  },
  functions: {
    param: 'functions',
  },
  ignore_eos: {
    param: 'ignore_eos',
  },
};

interface TritonChatCompleteResponse extends ChatCompletionResponse {}

interface TritonStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  system_fingerprint?: string;
  choices: Array<Record<string, any>>;
  usage?: ChatCompletionResponse['usage'];
}

export const TritonChatCompleteResponseTransform: (
  response: TritonChatCompleteResponse | Record<string, any>,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200) {
    const errorResponse = TritonOpenAIErrorResponseTransform(response);
    if (errorResponse) return errorResponse;
  }

  if ('choices' in response && Array.isArray(response.choices)) {
    return {
      id: response.id,
      object: response.object,
      created: response.created,
      model: response.model,
      provider: TRITON,
      choices: response.choices.map((choice) => ({
        index: choice.index,
        message: {
          role: choice.message?.role,
          content: choice.message?.content,
          ...(choice.message?.tool_calls
            ? { tool_calls: choice.message.tool_calls }
            : {}),
          ...(choice.message?.function_call
            ? { function_call: choice.message.function_call }
            : {}),
        },
        finish_reason: choice.finish_reason,
        ...(choice.logprobs !== undefined ? { logprobs: choice.logprobs } : {}),
      })),
      ...(response.usage
        ? {
            usage: {
              prompt_tokens: response.usage.prompt_tokens,
              completion_tokens: response.usage.completion_tokens,
              total_tokens: response.usage.total_tokens,
            },
          }
        : {}),
    };
  }

  return generateInvalidProviderResponseError(response, TRITON);
};

export const TritonChatCompleteStreamChunkTransform: (
  responseChunk: string
) => string = (responseChunk) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();
  if (chunk === '[DONE]') {
    return `data: ${chunk}\n\n`;
  }

  const parsedChunk: TritonStreamChunk = JSON.parse(chunk);
  return `data: ${JSON.stringify({
    id: parsedChunk.id,
    object: parsedChunk.object,
    created: parsedChunk.created,
    model: parsedChunk.model,
    provider: TRITON,
    choices: parsedChunk.choices,
    ...(parsedChunk.system_fingerprint
      ? { system_fingerprint: parsedChunk.system_fingerprint }
      : {}),
    ...(parsedChunk.usage ? { usage: parsedChunk.usage } : {}),
  })}\n\n`;
};
