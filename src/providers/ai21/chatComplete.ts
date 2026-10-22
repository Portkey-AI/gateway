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

// AI21 Jamba chat is OpenAI-compatible (/v1/chat/completions).
export const AI21ChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: 'jamba-large',
  },
  messages: {
    param: 'messages',
    required: true,
    default: [],
    transform: (params: Params) => {
      return params.messages?.map((message) => {
        if (message.role === 'developer') return { ...message, role: 'system' };
        return message;
      });
    },
  },
  max_tokens: {
    param: 'max_tokens',
    default: 16,
    min: 1,
  },
  max_completion_tokens: {
    param: 'max_tokens',
    default: 16,
    min: 1,
  },
  temperature: {
    param: 'temperature',
    default: 0.7,
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
  },
  stop: {
    param: 'stop',
  },
  stream: {
    param: 'stream',
    default: false,
  },
  presence_penalty: {
    param: 'presence_penalty',
    min: -2,
    max: 2,
  },
  frequency_penalty: {
    param: 'frequency_penalty',
    min: -2,
    max: 2,
  },
  documents: {
    param: 'documents',
  },
  response_format: {
    param: 'response_format',
  },
  tools: {
    param: 'tools',
  },
  tool_choice: {
    param: 'tool_choice',
  },
};

interface AI21ChatCompleteResponse extends ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface AI21StreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    delta: {
      role?: string | null;
      content?: string;
    };
    index: number;
    finish_reason: string | null;
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
    const errorResponse = AI21ErrorResponseTransform(
      response as AI21ErrorResponse
    );
    if (errorResponse) return errorResponse;
  }

  if ('choices' in response) {
    return {
      id: response.id,
      object: response.object ?? 'chat.completion',
      created: response.created ?? Math.floor(Date.now() / 1000),
      model: response.model,
      provider: AI21,
      choices: response.choices.map((c) => ({
        index: c.index,
        message: {
          role: c.message?.role ?? 'assistant',
          content: c.message?.content,
        },
        finish_reason: c.finish_reason,
      })),
      usage: {
        prompt_tokens: response.usage?.prompt_tokens,
        completion_tokens: response.usage?.completion_tokens,
        total_tokens: response.usage?.total_tokens,
      },
    };
  }

  return generateInvalidProviderResponseError(response, AI21);
};

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
      choices: [
        {
          index: parsedChunk.choices[0]?.index ?? 0,
          delta: parsedChunk.choices[0]?.delta ?? {},
          finish_reason: parsedChunk.choices[0]?.finish_reason ?? null,
        },
      ],
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
