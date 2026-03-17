import { LATITUDE } from '../../globals';
import { Params } from '../../types/requestBody';

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
import { LATITUDE_STOP_REASON } from './types';

export const LatitudeChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: 'qwen-2.5-7b',
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
  response_format: {
    param: 'response_format',
    default: null,
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
  stream: {
    param: 'stream',
    default: false,
  },
  frequency_penalty: {
    param: 'frequency_penalty',
    default: 0,
    min: -2,
    max: 2,
  },
  presence_penalty: {
    param: 'presence_penalty',
    default: 0,
    min: -2,
    max: 2,
  },
  stop: {
    param: 'stop',
    default: null,
  },
  seed: {
    param: 'seed',
    default: null,
  },
  tools: {
    param: 'tools',
    default: null,
  },
  tool_choice: {
    param: 'tool_choice',
    default: null,
  },
};

interface LatitudeChatCompleteResponse extends ChatCompletionResponse {
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

export interface LatitudeErrorResponse {
  object: string;
  message: string;
  type: string;
  param: string | null;
  code: string;
}

interface LatitudeStreamChunk {
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
      tool_calls?: any[];
    };
    index: number;
    finish_reason: string | null;
  }[];
}

export const LatitudeChatCompleteResponseTransform: (
  response: LatitudeChatCompleteResponse | LatitudeErrorResponse,
  responseStatus: number,
  responseHeaders: Headers,
  strictOpenAiCompliance: boolean
) => ChatCompletionResponse | ErrorResponse = (
  response,
  responseStatus,
  _responseHeaders,
  strictOpenAiCompliance
) => {
  if ('message' in response && responseStatus !== 200) {
    return generateErrorResponse(
      {
        message: response.message,
        type: response.type,
        param: response.param,
        code: response.code,
      },
      LATITUDE
    );
  }

  if ('choices' in response) {
    return {
      id: response.id,
      object: response.object,
      created: response.created,
      model: response.model,
      provider: LATITUDE,
      choices: response.choices.map((c) => ({
        index: c.index,
        message: {
          role: c.message.role,
          content: c.message.content,
          tool_calls: c.message.tool_calls,
        },
        finish_reason: transformFinishReason(
          c.finish_reason as LATITUDE_STOP_REASON,
          strictOpenAiCompliance
        ),
      })),
      usage: {
        prompt_tokens: response.usage?.prompt_tokens,
        completion_tokens: response.usage?.completion_tokens,
        total_tokens: response.usage?.total_tokens,
      },
    };
  }

  return generateInvalidProviderResponseError(response, LATITUDE);
};

export const LatitudeChatCompleteStreamChunkTransform: (
  response: string,
  fallbackId: string,
  streamState: any,
  strictOpenAiCompliance: boolean,
  gatewayRequest: Params
) => string | string[] = (
  responseChunk,
  fallbackId,
  _streamState,
  strictOpenAiCompliance,
  _gatewayRequest
) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();
  if (chunk === '[DONE]') {
    return `data: ${chunk}\n\n`;
  }
  const parsedChunk: LatitudeStreamChunk = JSON.parse(chunk);
  const finishReason = parsedChunk.choices[0].finish_reason
    ? transformFinishReason(
        parsedChunk.choices[0].finish_reason as LATITUDE_STOP_REASON,
        strictOpenAiCompliance
      )
    : null;
  return (
    `data: ${JSON.stringify({
      id: parsedChunk.id,
      object: parsedChunk.object,
      created: parsedChunk.created,
      model: parsedChunk.model,
      provider: LATITUDE,
      choices: [
        {
          index: parsedChunk.choices[0].index,
          delta: parsedChunk.choices[0].delta,
          finish_reason: finishReason,
        },
      ],
      usage: parsedChunk.usage,
    })}` + '\n\n'
  );
};
