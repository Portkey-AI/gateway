import { EUROUTER } from '../../globals';
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

export const EurouterChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: '',
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
  max_tokens: {
    param: 'max_tokens',
    default: 100,
    min: 0,
  },
  max_completion_tokens: {
    param: 'max_tokens',
    default: 100,
    min: 0,
  },
  temperature: {
    param: 'temperature',
    default: 1,
    min: 0,
    max: 2,
  },
  top_p: {
    param: 'top_p',
    default: 1,
    min: 0,
    max: 1,
  },
  tools: {
    param: 'tools',
  },
  tool_choice: {
    param: 'tool_choice',
  },
  stream: {
    param: 'stream',
    default: false,
  },
  stream_options: {
    param: 'stream_options',
  },
  response_format: {
    param: 'response_format',
  },
};

interface EurouterChatCompleteResponse extends ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
}

export interface EurouterErrorResponse {
  object: string;
  message: string;
  type: string;
  param: string | null;
  code: string;
}

interface EurouterStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  choices: {
    delta: {
      role?: string | null;
      content?: string;
    };
    index: number;
    finish_reason: string | null;
  }[];
}

export const EurouterChatCompleteResponseTransform: (
  response: EurouterChatCompleteResponse | EurouterErrorResponse,
  responseStatus: number,
  _responseHeaders: Headers,
  _strictOpenAiCompliance: boolean,
  _gatewayRequestUrl: string,
  _gatewayRequest: Params
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if ('message' in response && responseStatus !== 200) {
    return generateErrorResponse(
      {
        message: response.message,
        type: response.type,
        param: response.param,
        code: response.code,
      },
      EUROUTER
    );
  }

  if ('choices' in response) {
    return {
      id: response.id,
      object: response.object,
      created: response.created,
      model: response.model,
      provider: EUROUTER,
      choices: response.choices.map((c) => ({
        index: c.index,
        message: {
          role: c.message.role,
          content: c.message.content,
          ...(c.message.tool_calls && { tool_calls: c.message.tool_calls }),
        },
        finish_reason: c.finish_reason,
      })),
      usage: response.usage,
    };
  }

  return generateInvalidProviderResponseError(response, EUROUTER);
};

export const EurouterChatCompleteStreamChunkTransform: (
  response: string,
  fallbackId: string,
  _streamState: Record<string, boolean>,
  _strictOpenAiCompliance: boolean,
  gatewayRequest: Params
) => string = (responseChunk, fallbackId) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();
  if (chunk === '[DONE]') {
    return `data: ${chunk}\n\n`;
  }
  const parsedChunk: EurouterStreamChunk = JSON.parse(chunk);

  return (
    `data: ${JSON.stringify({
      id: parsedChunk.id,
      object: parsedChunk.object,
      created: parsedChunk.created,
      model: parsedChunk.model,
      provider: EUROUTER,
      choices: [
        {
          index: parsedChunk.choices?.[0]?.index,
          delta: parsedChunk.choices?.[0]?.delta,
          finish_reason: parsedChunk.choices?.[0]?.finish_reason,
        },
      ],
      ...(parsedChunk.usage && { usage: parsedChunk.usage }),
    })}` + '\n\n'
  );
};
