import { GROQ } from '../../globals';
import { ChatCompletionResponse, ErrorResponse } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';

export interface GroqChatCompleteResponse extends ChatCompletionResponse {}

export interface GroqErrorResponse extends ErrorResponse {}

export interface GroqStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    delta: {
      content?: string;
      tool_calls?: object[];
    };
    index: number;
    finish_reason: string | null;
    logprobs: object | null;
  }[];
  x_groq: {
    usage: {
      queue_time: number;
      prompt_tokens: number;
      prompt_time: number;
      completion_tokens: number;
      completion_time: number;
      total_tokens: number;
      total_time: number;
    };
  };
}

export const GroqChatCompleteResponseTransform: (
  response: GroqChatCompleteResponse | GroqErrorResponse,
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
      GROQ
    );
  }

  if ('choices' in response) {
    return {
      id: response.id,
      object: response.object,
      created: response.created,
      model: response.model,
      provider: GROQ,
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

  return generateInvalidProviderResponseError(response, GROQ);
};

export const GroqChatCompleteStreamChunkTransform: (
  response: string
) => string = (responseChunk) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();
  if (chunk === '[DONE]') {
    return `data: ${chunk}\n\n`;
  }

  const parsedChunk: GroqStreamChunk = JSON.parse(chunk);
  if (parsedChunk['x_groq'] && parsedChunk['x_groq'].usage) {
    return `data: ${JSON.stringify({
      id: parsedChunk.id,
      object: parsedChunk.object,
      created: parsedChunk.created,
      model: parsedChunk.model,
      provider: GROQ,
      choices: [
        {
          index: parsedChunk.choices[0].index || 0,
          delta: {},
          logprobs: null,
          finish_reason: parsedChunk.choices[0].finish_reason,
        },
      ],
      usage: {
        prompt_tokens: parsedChunk['x_groq'].usage.prompt_tokens || 0,
        completion_tokens: parsedChunk['x_groq'].usage.completion_tokens || 0,
        total_tokens: parsedChunk['x_groq'].usage.total_tokens || 0,
      },
    })}\n\n`;
  }
  return `data: ${JSON.stringify({
    id: parsedChunk.id,
    object: parsedChunk.object,
    created: parsedChunk.created,
    model: parsedChunk.model,
    provider: GROQ,
    choices: [
      {
        index: parsedChunk.choices[0].index || 0,
        delta: {
          role: 'assistant',
          content: parsedChunk.choices[0].delta.content,
          tool_calls: parsedChunk.choices[0].delta?.tool_calls,
        },
        logprobs: null,
        finish_reason: parsedChunk.choices[0].finish_reason || null,
      },
    ],
  })}\n\n`;
};
