import { AI21 } from '../../globals';
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
import { AI21ErrorResponse } from './complete';

// AI21's Jamba models are served over an OpenAI-compatible endpoint
// (POST /studio/v1/chat/completions), so the request/response shapes below
// mirror the standard OpenAI chat format.
export const AI21ChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
  },
  messages: {
    param: 'messages',
    required: true,
    default: [],
  },
  max_tokens: {
    param: 'max_tokens',
    default: 16,
    min: 0,
  },
  max_completion_tokens: {
    param: 'max_tokens',
    default: 16,
    min: 0,
  },
  temperature: {
    param: 'temperature',
    default: 0.4,
    min: 0,
    max: 2,
  },
  top_p: {
    param: 'top_p',
    default: 1,
    min: 0,
    max: 1,
  },
  n: {
    param: 'n',
    default: 1,
    min: 1,
    max: 16,
  },
  stop: {
    param: 'stop',
  },
  stream: {
    param: 'stream',
    default: false,
  },
  tools: {
    param: 'tools',
  },
  tool_choice: {
    param: 'tool_choice',
  },
  response_format: {
    param: 'response_format',
  },
};

interface AI21ChatCompleteResponse {
  id: string;
  model: string;
  object?: string;
  created?: number;
  choices: {
    index: number;
    message: {
      role: string;
      content?: string | null;
      tool_calls?: object[];
    };
    finish_reason: string;
    logprobs?: object | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export const AI21ErrorResponseTransform: (
  response: AI21ErrorResponse
) => ErrorResponse | undefined = (response) => {
  if ('detail' in response) {
    return generateErrorResponse(
      { message: response.detail, type: null, param: null, code: null },
      AI21
    );
  }

  return undefined;
};

export const AI21ChatCompleteResponseTransform: (
  response: AI21ChatCompleteResponse | AI21ErrorResponse,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200) {
    const errorResposne = AI21ErrorResponseTransform(
      response as AI21ErrorResponse
    );
    if (errorResposne) return errorResposne;
  }

  if ('choices' in response) {
    return {
      id: response.id,
      object: response.object || 'chat.completion',
      created: response.created || Math.floor(Date.now() / 1000),
      model: response.model,
      provider: AI21,
      choices: response.choices.map((c) => ({
        index: c.index,
        message: {
          role: 'assistant',
          content: c.message.content ?? undefined,
          ...(c.message.tool_calls ? { tool_calls: c.message.tool_calls } : {}),
        },
        logprobs: c.logprobs ?? null,
        finish_reason: c.finish_reason,
      })),
      usage: {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0,
      },
    };
  }

  return generateInvalidProviderResponseError(response, AI21);
};

interface AI21StreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: object[];
    };
    finish_reason: string | null;
    logprobs?: object | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export const AI21ChatCompleteStreamChunkTransform: (
  response: string
) => string = (responseChunk) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();
  if (chunk === '[DONE]') {
    return `data: ${chunk}\n\n`;
  }

  const parsedChunk: AI21StreamChunk = JSON.parse(chunk);
  return (
    `data: ${JSON.stringify({
      id: parsedChunk.id,
      object: parsedChunk.object,
      created: parsedChunk.created,
      model: parsedChunk.model,
      provider: AI21,
      choices: parsedChunk.choices.map((c) => ({
        index: c.index,
        delta: c.delta,
        logprobs: c.logprobs ?? null,
        finish_reason: c.finish_reason,
      })),
      usage: parsedChunk.usage
        ? {
            prompt_tokens: parsedChunk.usage.prompt_tokens,
            completion_tokens: parsedChunk.usage.completion_tokens,
            total_tokens: parsedChunk.usage.total_tokens,
          }
        : undefined,
    })}` + '\n\n'
  );
};
