import { AI21 } from '../../globals';
import { Params, SYSTEM_MESSAGE_ROLES } from '../../types/requestBody';
import {
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
  transformFinishReason,
} from '../utils';
import { AI21ErrorResponse } from './complete';

export const AI21ChatCompleteConfig: ProviderConfig = {
  messages: [
    {
      param: 'messages',
      required: true,
      transform: (params: Params) => {
        let inputMessages: any = [];

        if (
          params.messages?.[0]?.role &&
          SYSTEM_MESSAGE_ROLES.includes(params.messages?.[0]?.role)
        ) {
          inputMessages = params.messages.slice(1);
        } else if (params.messages) {
          inputMessages = params.messages;
        }

        return inputMessages.map((msg: any) => ({
          text: msg.content,
          role: msg.role,
        }));
      },
    },
    {
      param: 'system',
      required: false,
      transform: (params: Params) => {
        if (
          params.messages?.[0]?.role &&
          SYSTEM_MESSAGE_ROLES.includes(params.messages?.[0]?.role)
        ) {
          return params.messages?.[0].content;
        }
      },
    },
  ],
  n: {
    param: 'numResults',
    default: 1,
  },
  max_tokens: {
    param: 'maxTokens',
    default: 16,
  },
  max_completion_tokens: {
    param: 'maxTokens',
    default: 16,
  },
  minTokens: {
    param: 'minTokens',
    default: 0,
  },
  temperature: {
    param: 'temperature',
    default: 0.7,
    min: 0,
    max: 1,
  },
  top_p: {
    param: 'topP',
    default: 1,
  },
  top_k: {
    param: 'topKReturn',
    default: 0,
  },
  stop: {
    param: 'stopSequences',
  },
  presence_penalty: {
    param: 'presencePenalty',
    transform: (params: Params) => {
      return {
        scale: params.presence_penalty,
      };
    },
  },
  frequency_penalty: {
    param: 'frequencyPenalty',
    transform: (params: Params) => {
      return {
        scale: params.frequency_penalty,
      };
    },
  },
  stream: {
    param: 'stream',
    default: false,
  },
  countPenalty: {
    param: 'countPenalty',
  },
  frequencyPenalty: {
    param: 'frequencyPenalty',
  },
  presencePenalty: {
    param: 'presencePenalty',
  },
};

interface AI21ChatCompleteResponse {
  id: string;
  outputs: {
    text: string;
    role: string;
    finishReason: {
      reason: string;
      length: number | null;
      sequence: string | null;
    };
  }[];
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

  if ('outputs' in response) {
    return {
      id: response.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: '',
      provider: AI21,
      choices: response.outputs.map((o, index) => ({
        message: {
          role: 'assistant',
          content: o.text,
        },
        index: index,
        logprobs: null,
        finish_reason: o.finishReason?.reason,
      })),
    };
  }

  return generateInvalidProviderResponseError(response, AI21);
};

interface AI21ChatCompleteStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null | undefined;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
}

export const AI21ChatCompleteStreamChunkTransform: (
  response: string,
  fallbackId: string,
  streamState: Record<string, unknown>,
  strictOpenAiCompliance: boolean
) => string = (
  responseChunk,
  fallbackId,
  _streamState,
  strictOpenAiCompliance
) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();
  if (chunk === '[DONE]') {
    return `data: ${chunk}\n\n`;
  }
  const parsedChunk: AI21ChatCompleteStreamChunk = JSON.parse(chunk);
  return (
    `data: ${JSON.stringify({
      id: parsedChunk.id ?? fallbackId,
      object: parsedChunk.object ?? 'chat.completion.chunk',
      created: parsedChunk.created ?? Math.floor(Date.now() / 1000),
      model: parsedChunk.model ?? '',
      provider: AI21,
      choices: [
        {
          index: parsedChunk.choices[0]?.index ?? 0,
          delta: parsedChunk.choices[0]?.delta ?? {},
          finish_reason: parsedChunk.choices[0]?.finish_reason
            ? transformFinishReason(
                parsedChunk.choices[0].finish_reason as any,
                strictOpenAiCompliance
              )
            : null,
        },
      ],
      usage: parsedChunk.usage ?? null,
    })}` + '\n\n'
  );
};
