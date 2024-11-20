import { XAI } from '../../globals';

import {
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';

import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';

export const xAIChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: 'grok-beta',
  },
  messages: {
    param: 'messages',
    required: true,
    default: [],
  },
  max_tokens: {
    param: 'max_tokens',
    required: true,
    min: 1,
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
  n: {
    param: 'n',
    required: false,
    default: 1,
  },
  stop: {
    param: 'stop',
    required: false,
    default: null,
  },
};

interface xAIChatCompleteResponse extends ChatCompletionResponse {
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

export interface xAIErrorResponse extends ErrorResponse {
  message: string;
  type: string;
  param: string | null;
  code?: string;
  provider: string;
}

interface xAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    delta: {
      role?: string;
      content?: string;
    };
    index: number;
    finish_reason: string | null;
  }[];
}

export const xAIChatCompleteResponseTransform: (
  response: xAIChatCompleteResponse | xAIErrorResponse,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if ('error' in response && responseStatus !== 200) {
    return generateErrorResponse(
      {
        message: response.error.message,
        type: response.error.type,
        param: null,
        code: response.error.code || null,
      },
      XAI
    );
  }

  if ('choices' in response) {
    return {
      id: response.id,
      object: response.object,
      created: response.created,
      model: response.model,
      provider: XAI,
      choices: response.choices.map((c) => ({
        index: c.index,
        message: {
          role: c.message.role,
          content: c.message.content,
        },
        finish_reason: c.finish_reason,
      })),
      usage: {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0,
      },
    };
  }

  return generateInvalidProviderResponseError(response, XAI);
};

export const xAIChatCompleteStreamChunkTransform: (
  response: string
) => string = (responseChunk) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();
  if (chunk === '[DONE]') {
    return `data: ${chunk}\n\n`;
  }

  const parsedChunk: xAIStreamChunk = JSON.parse(chunk);
  return `data: ${JSON.stringify({
    id: parsedChunk.id,
    object: parsedChunk.object,
    created: parsedChunk.created,
    model: parsedChunk.model,
    provider: XAI,
    choices: [
      {
        index: parsedChunk.choices[0].index,
        delta: parsedChunk.choices[0].delta,
        finish_reason: parsedChunk.choices[0].finish_reason,
      },
    ],
  })}\n\n`;
};
