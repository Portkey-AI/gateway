import { MINIMAX } from '../../globals';
import { ChatCompletionResponse, ErrorResponse } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';

export interface MiniMaxChatCompleteResponse extends ChatCompletionResponse {}

export interface MiniMaxErrorResponse extends ErrorResponse {}

export interface MiniMaxStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    delta: {
      role?: string | null;
      content?: string;
      tool_calls?: object[];
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

export const MiniMaxChatCompleteResponseTransform: (
  response: MiniMaxChatCompleteResponse | MiniMaxErrorResponse,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if ('error' in response && responseStatus !== 200) {
    return generateErrorResponse(
      {
        message: response.error.message,
        type: response.error.type,
        param: null,
        code: response.error.code?.toString() || null,
      },
      MINIMAX
    );
  }

  if ('choices' in response) {
    return {
      id: response.id,
      object: response.object,
      created: response.created,
      model: response.model,
      provider: MINIMAX,
      choices: response.choices.map((c) => ({
        index: c.index,
        message: c.message,
        logprobs: c.logprobs,
        finish_reason: c.finish_reason,
      })),
      usage: {
        prompt_tokens: response.usage?.prompt_tokens || 0,
        completion_tokens: response.usage?.completion_tokens || 0,
        total_tokens: response.usage?.total_tokens || 0,
      },
    };
  }

  return generateInvalidProviderResponseError(response, MINIMAX);
};

export const MiniMaxChatCompleteStreamChunkTransform: (
  response: string
) => string = (responseChunk) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();
  if (chunk === '[DONE]') {
    return `data: ${chunk}\n\n`;
  }

  const parsedChunk: MiniMaxStreamChunk = JSON.parse(chunk);
  return (
    `data: ${JSON.stringify({
      id: parsedChunk.id,
      object: parsedChunk.object,
      created: parsedChunk.created,
      model: parsedChunk.model,
      provider: MINIMAX,
      choices:
        parsedChunk.choices && parsedChunk.choices.length > 0
          ? [
              {
                index: parsedChunk.choices[0].index || 0,
                delta: {
                  role: parsedChunk.choices[0].delta?.role || undefined,
                  content: parsedChunk.choices[0].delta?.content || '',
                  tool_calls:
                    parsedChunk.choices[0].delta?.tool_calls || undefined,
                },
                finish_reason: parsedChunk.choices[0].finish_reason || null,
              },
            ]
          : [],
      usage: parsedChunk.usage
        ? {
            prompt_tokens: parsedChunk.usage.prompt_tokens || 0,
            completion_tokens: parsedChunk.usage.completion_tokens || 0,
            total_tokens: parsedChunk.usage.total_tokens || 0,
          }
        : undefined,
    })}` + '\n\n'
  );
};
