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
        return params.messages?.map((msg: any) => {
          let textContent: string = '';
          if (Array.isArray(msg.content)) {
            msg.content.map((c: any) => {
              if (c.type === 'text') {
                textContent = c.text;
              }
            });
          } else {
            textContent = msg.content;
          }

          return {
            role: msg.role,
            content: textContent,
          };
        });
      },
    },
    {
      param: 'documents',
      transform: (params: Params) => {
        const documents: any[] = [];
        params.messages?.forEach((msg: any) => {
          if (Array.isArray(msg.content)) {
            msg.content.forEach((c: any) => {
              if (c.type !== 'text') {
                documents.push({
                  content: c.content,
                  value: c.type,
                });
              }
            });
          }
        });

        return documents.length == 0 ? documents : undefined;
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
