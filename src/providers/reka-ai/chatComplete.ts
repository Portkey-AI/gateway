import { REKA_AI } from '../../globals';
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

export const RekaAIChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model_name',
    required: true,
    default: 'reka-flash',
  },
  messages: {
    param: 'conversation_history',
    transform: (params: Params) => {
      const mappedMessages = params.messages?.map((message) => ({
        type: message.role === 'user' ? 'human' : 'model',
        text: message.content,
      }));
      return mappedMessages;
    },
  },
  max_tokens: {
    param: 'request_output_len',
  },
  temperature: {
    param: 'temperature'

  },
  top_p: {
    param: 'runtime_top_p',
  },
  top_k: {
    param: 'runtime_top_k',
  },
  stop: {
    param: 'stop_words',
  },

};

export interface RekaAIChatCompleteResponse {
  type: string;
  text: string;
  finish_reason: string;
  metadata: {
    input_tokens: number;
    generated_tokens: number;
  };
};

export interface RekaAIErrorResponse {
  detail: any; // could be string or array
}

export const RekaAIChatCompleteResponseTransform: (
  response: RekaAIChatCompleteResponse | RekaAIErrorResponse,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if ('detail' in response) {
    return generateErrorResponse(
      {
        message: JSON.stringify(response.detail),
        type: null,
        param: null,
        code: null,
      },
      REKA_AI
    );
  }

  if ('text' in response) {
    return {
      id: crypto.randomUUID(),
      object: 'chat_completion',
      created: Math.floor(Date.now() / 1000),
      model: 'Unknown',
      provider: REKA_AI,
      choices: [
        {
          message: {
            role: 'assistant',
            content: response.text
          },
          index: 0,
          logprobs: null,
          finish_reason: response.finish_reason,
        },
      ],
      usage: {
        prompt_tokens: response.metadata.input_tokens,
        completion_tokens: response.metadata.generated_tokens,
        total_tokens:
          response.metadata.input_tokens +
          response.metadata.generated_tokens,
      },
    };
  }

  return generateInvalidProviderResponseError(response, REKA_AI);
};
