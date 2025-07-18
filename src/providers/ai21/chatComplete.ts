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
} from '../utils';
import { AI21ErrorResponse } from './complete';

export const AI21ChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
  },
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
  tools: {
    param: 'tools',
  },
  n: {
    param: 'numResults',
    default: 1,
    min: 1,
    max: 16,
  },
  documents: {
    param: 'documents',
  },
  response_format: {
    param: 'responseFormat',
  },
  max_tokens: {
    param: 'maxTokens',
    default: 16,
  },
  temperature: {
    param: 'temperature',
    default: 0.4,
    min: 0,
    max: 2,
  },
  top_p: {
    param: 'topP',
    default: 1,
    min: 0,
    max: 1,
  },
  stop: {
    param: 'stopSequences',
  },
  stream: {
    param: 'stream',
  },
};

interface AI21ChatCompleteResponse {
  id: string;
  model: string;
  choices: {
    index: {};
    message: {
      role: string;
      content: string;
    };
    tool_calls?: {
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: Record<string, any>;
      };
    }[];
  }[];
  finish_reason: 'stop' | 'length';
  usage: {
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
      object: 'chat.completion',
      model: response.model,
      choices: response.choices?.map((c, index) => ({
        index: index,
        message: {
          role: 'assistant',
          content: c.message.content,
        },
        tool_calls: c.tool_calls?.map((toolCall: any) => {
          return {
            id: toolCall.id,
            type: toolCall.type,
            function: {
              name: toolCall.function.name,
              arguments: toolCall.function.arguments,
            },
          };
        }),
      })),
      finish_reason: response.finish_reason,
      usage: response.usage,
      created: Math.floor(Date.now() / 1000),
    };
  }

  return generateInvalidProviderResponseError(response, AI21);
};
