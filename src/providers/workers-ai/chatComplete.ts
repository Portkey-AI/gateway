import { WORKERS_AI } from '../../globals';
import { Params } from '../../types/requestBody';
import {
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';
import { generateInvalidProviderResponseError } from '../utils';
import {
  WorkersAiErrorResponse,
  WorkersAiErrorResponseTransform,
} from './utils';

export const WorkersAiChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
  },
  messages: {
    param: 'messages',
    default: '',
    transform: (params: Params) => {
      return params.messages?.map((message) => {
        if (message.role === 'developer') return { ...message, role: 'system' };
        return message;
      });
    },
  },
  stream: {
    param: 'stream',
    default: false,
  },
  raw: {
    param: 'raw',
  },
  max_tokens: {
    param: 'max_tokens',
  },
  max_completion_tokens: {
    param: 'max_tokens',
  },
};

interface WorkersAiChatCompleteResponse {
  result: {
    response: string;
  };
  success: boolean;
  errors: string[];
  messages: string[];
}

interface WorkersAiChatCompleteStreamResponse {
  response: string;
  p?: string;
}

interface WorkersAiOpenAIChatCompleteResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
    logprobs: object | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface WorkersAiOpenAIChatCompleteStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    delta: { role?: string; content?: string; tool_calls?: object[] };
    index: number;
    finish_reason: string | null;
    logprobs: object | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// TODO: cloudflare do not return the usage
export const WorkersAiChatCompleteResponseTransform: (
  response: WorkersAiChatCompleteResponse | WorkersAiErrorResponse,
  responseStatus: number,
  responseHeaders: Headers,
  strictOpenAiCompliance: boolean,
  gatewayRequestUrl: string,
  gatewayRequest: Params
) => ChatCompletionResponse | ErrorResponse = (
  response,
  responseStatus,
  _responseHeaders,
  _strictOpenAiCompliance,
  _gatewayRequestUrl,
  gatewayRequest
) => {
  if (responseStatus !== 200) {
    const errorResponse = WorkersAiErrorResponseTransform(
      response as WorkersAiErrorResponse
    );
    if (errorResponse) return errorResponse;
  }

  if ('choices' in response) {
    return {
      ...(response as unknown as WorkersAiOpenAIChatCompleteResponse),
      provider: WORKERS_AI,
    } as ChatCompletionResponse;
  }

  if ('result' in response) {
    return {
      id: Date.now().toString(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: gatewayRequest.model || '',
      provider: WORKERS_AI,
      choices: [
        {
          message: { role: 'assistant', content: response.result.response },
          index: 0,
          logprobs: null,
          finish_reason: '',
        },
      ],
    };
  }

  return generateInvalidProviderResponseError(response, WORKERS_AI);
};

export const WorkersAiChatCompleteStreamChunkTransform: (
  response: string,
  fallbackId: string,
  _streamState: Record<string, boolean>,
  _strictOpenAiCompliance: boolean,
  gatewayRequest: Params
) => string | undefined = (
  responseChunk,
  fallbackId,
  _streamState,
  _strictOpenAiCompliance,
  gatewayRequest
) => {
  let chunk = responseChunk.trim();

  if (chunk.startsWith('data: [DONE]')) {
    return 'data: [DONE]\n\n';
  }

  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();

  const parsedChunk: WorkersAiChatCompleteStreamResponse = JSON.parse(chunk);

  if ('choices' in parsedChunk) {
    return (
      `data: ${JSON.stringify({
        ...(parsedChunk as unknown as WorkersAiOpenAIChatCompleteStreamChunk),
        provider: WORKERS_AI,
      })}` + '\n\n'
    );
  }

  return (
    `data: ${JSON.stringify({
      id: fallbackId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: gatewayRequest.model || '',
      provider: WORKERS_AI,
      choices: [
        {
          delta: {
            content: parsedChunk.response,
          },
          index: 0,
          logprobs: null,
          finish_reason: null,
        },
      ],
    })}` + '\n\n'
  );
};
