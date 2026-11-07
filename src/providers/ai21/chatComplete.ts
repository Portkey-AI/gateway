import { AI21 } from '../../globals';
import { ChatCompletionResponse, ErrorResponse } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';
import { OpenAIErrorResponseTransform } from '../openai/utils';
import { AI21ErrorResponse } from './complete';

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

interface AI21ChatCompleteResponse {
  id: string;
  object?: string;
  created?: number;
  model?: string;
  choices: {
    index: number;
    message?: {
      role?: ChatCompletionResponse['choices'][number]['message']['role'];
      content?: ChatCompletionResponse['choices'][number]['message']['content'];
      tool_calls?: any;
    };
    finish_reason?: string;
    logprobs?: object | null;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

interface AI21StreamChunk {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: {
    index?: number;
    delta?: {
      role?: string | null;
      content?: string | null;
      tool_calls?: object[];
    };
    finish_reason?: string | null;
    logprobs?: object | null;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
}

const isRecord = (value: unknown): value is Record<string, any> => {
  return typeof value === 'object' && value !== null;
};

export const AI21ChatCompleteResponseTransform: (
  response: AI21ChatCompleteResponse | AI21ErrorResponse | ErrorResponse,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && isRecord(response)) {
    if ('detail' in response) {
      const errorResponse = AI21ErrorResponseTransform(
        response as AI21ErrorResponse
      );
      if (errorResponse) return errorResponse;
    }

    if ('error' in response) {
      return OpenAIErrorResponseTransform(response as ErrorResponse, AI21);
    }
  }

  if (isRecord(response) && 'choices' in response) {
    const chatResponse = response as AI21ChatCompleteResponse;
    return {
      id: chatResponse.id,
      object: chatResponse.object || 'chat.completion',
      created: chatResponse.created ?? Math.floor(Date.now() / 1000),
      model: chatResponse.model || '',
      provider: AI21,
      choices: chatResponse.choices.map((choice) => ({
        index: choice.index,
        message: {
          role: choice.message?.role ?? 'assistant',
          content: choice.message?.content,
          ...(choice.message?.tool_calls
            ? { tool_calls: choice.message.tool_calls }
            : {}),
        },
        logprobs: choice.logprobs ?? null,
        finish_reason: choice.finish_reason ?? '',
      })),
      usage: chatResponse.usage
        ? {
            prompt_tokens: chatResponse.usage.prompt_tokens ?? 0,
            completion_tokens: chatResponse.usage.completion_tokens ?? 0,
            total_tokens: chatResponse.usage.total_tokens ?? 0,
          }
        : undefined,
    };
  }

  return generateInvalidProviderResponseError(response, AI21);
};

/**
 * Jamba streams OpenAI-style SSE: `data: {choices[].delta}` chunks and a
 * final `data: [DONE]`. Usage is null until the last chunk.
 * https://docs.ai21.com/reference/jamba-api-response
 */
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
  const usage =
    parsedChunk.usage && typeof parsedChunk.usage === 'object'
      ? {
          prompt_tokens: parsedChunk.usage.prompt_tokens ?? 0,
          completion_tokens: parsedChunk.usage.completion_tokens ?? 0,
          total_tokens: parsedChunk.usage.total_tokens ?? 0,
        }
      : undefined;

  return (
    `data: ${JSON.stringify({
      id: parsedChunk.id,
      object: parsedChunk.object || 'chat.completion.chunk',
      created: parsedChunk.created,
      model: parsedChunk.model,
      provider: AI21,
      choices: (parsedChunk.choices ?? []).map((choice) => ({
        index: choice.index ?? 0,
        delta: choice.delta ?? {},
        logprobs: choice.logprobs ?? null,
        finish_reason: choice.finish_reason ?? null,
      })),
      ...(usage ? { usage } : {}),
    })}` + '\n\n'
  );
};
