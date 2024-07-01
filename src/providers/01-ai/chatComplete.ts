import {
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';
import { generateErrorResponse } from '../utils';
import { ZEROONE_AI } from '../../globals';

export const ZeroOneAIChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: 'yi-large',
  },
  messages: {
    param: 'messages',
    required: true,
    default: [],
  },
  max_tokens: {
    param: 'max_tokens',
    default: 100,
    min: 1,
  },
  top_p: {
    param: 'top_p',
    default: 1,
    min: 0,
    max: 1,
  },
  temperature: {
    param: 'temperature',
    default: 1,
    min: 0,
    max: 2,
  },
  stream: {
    param: 'stream',
    default: false,
  },
};

interface ZeroOneAIChatCompleteStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  content: string;
  lastOne: boolean;
  choices: {
    delta: {
      role: string | null;
      content: string | null;
    };
    index: number;
    finish_reason: string | null;
  }[];
}

export interface ZeroOneChatCompleteResponse extends ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export const ZeroOneErrorResponseTransform: (
  response: ErrorResponse,
  provider: string
) => ErrorResponse = (response, provider) => {
  return generateErrorResponse(
    {
      ...response.error,
    },
    provider
  );
};

export const ZeroOneChatCompleteResponseTransform: (
  response: ZeroOneChatCompleteResponse | ErrorResponse,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return ZeroOneErrorResponseTransform(response, ZEROONE_AI);
  }
  return response;
};

export const ZeroOneChatCompleteStreamChunkTransform: (
  response: string
) => string = (responseChunk) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();
  if (chunk === '[DONE]') {
    return `data: ${chunk}\n\n`;
  }
  const parsedChunk: ZeroOneAIChatCompleteStreamChunk = JSON.parse(chunk);
  return `data: ${JSON.stringify({
    id: parsedChunk.id,
    object: parsedChunk.object,
    created: parsedChunk.created,
    model: parsedChunk.model,
    provider: ZEROONE_AI,
    choices: parsedChunk.choices.map((c) => ({
      index: c.index,
      delta: c.delta.content ?? '',
      finish_reason: c.finish_reason ?? null,
    })),
  })}\n\n`;
};
