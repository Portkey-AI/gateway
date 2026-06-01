import { Params } from '../../types/requestBody';
import {
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';
import { TRITON } from '../../globals';

export const TritonChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
  },
  messages: {
    param: 'messages',
    required: true,
  },
  max_tokens: {
    param: 'max_tokens',
    default: 100,
  },
  temperature: {
    param: 'temperature',
    default: 0.7,
    min: 0,
    max: 1,
  },
  top_p: {
    param: 'top_p',
    default: 0.7,
    min: 0,
    max: 1,
  },
  stream: {
    param: 'stream',
    default: false,
  },
  stop: {
    param: 'stop',
  },
};

interface TritonChatCompleteResponse extends ChatCompletionResponse {}

interface TritonChatCompleteErrorResponse {
  error: string;
}

const TritonChatCompleteErrorResponseTransform: (
  response: TritonChatCompleteErrorResponse
) => ErrorResponse | undefined = (response) => {
  if ('error' in response) {
    return generateErrorResponse(
      { message: response.error, type: null, param: null, code: null },
      TRITON
    );
  }
  return undefined;
};

export const TritonChatCompleteResponseTransform: (
  response: TritonChatCompleteResponse | TritonChatCompleteErrorResponse,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200) {
    const errorResponse = TritonChatCompleteErrorResponseTransform(
      response as TritonChatCompleteErrorResponse
    );
    if (errorResponse) return errorResponse;
  }

  if ('choices' in response) {
    return {
      id: response.id,
      object: response.object,
      created: response.created,
      model: response.model,
      provider: TRITON,
      choices: response.choices.map((c) => ({
        index: c.index,
        message: {
          role: c.message.role,
          content: c.message.content,
          tool_calls: c.message.tool_calls,
        },
        finish_reason: c.finish_reason,
      })),
      usage: {
        prompt_tokens: response.usage?.prompt_tokens ?? -1,
        completion_tokens: response.usage?.completion_tokens ?? -1,
        total_tokens: response.usage?.total_tokens ?? -1,
      },
    };
  }

  return generateInvalidProviderResponseError(response, TRITON);
};

interface TritonChatCompleteStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    delta: {
      role?: string | null;
      content?: string;
      tool_calls?: any[];
    };
    index: number;
    finish_reason: string | null;
  }[];
}

export const TritonChatCompleteStreamChunkTransform: (
  responseChunk: string,
  fallbackId: string
) => string = (responseChunk, fallbackId) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();
  if (chunk === '[DONE]') {
    return `data: ${chunk}\n\n`;
  }
  const parsedChunk: TritonChatCompleteStreamChunk = JSON.parse(chunk);
  return (
    `data: ${JSON.stringify({
      id: parsedChunk.id || fallbackId,
      object: parsedChunk.object,
      created: parsedChunk.created,
      model: parsedChunk.model,
      provider: TRITON,
      choices: [
        {
          index: parsedChunk.choices[0].index,
          delta: parsedChunk.choices[0].delta,
          finish_reason: parsedChunk.choices[0].finish_reason,
        },
      ],
    })}` + '\n\n'
  );
};
