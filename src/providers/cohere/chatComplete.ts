import { COHERE } from '../../globals';
import { Message, Params } from '../../types/requestBody';
import {
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';
import { generateErrorResponse } from '../utils';

// TODOS: this configuration does not enforce the maximum token limit for the input parameter. If you want to enforce this, you might need to add a custom validation function or a max property to the ParameterConfig interface, and then use it in the input configuration. However, this might be complex because the token count is not a simple length check, but depends on the specific tokenization method used by the model.

export const CohereChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    default: 'command',
    required: true,
  },
  message: {
    param: 'message',
    required: true,
  },
  messages: {
    param: 'chat_history',
    required: false,
    transform: (params: Params) => {
      // generate history and forward it to model
      const history: (Message & { message?: string })[] = (
        params.messages || []
      ).map((message) => ({
        role: message.role,
        message: message.content as string,
      }));
      return history;
    },
  },
  max_tokens: {
    param: 'max_tokens',
    default: 20,
    min: 1,
  },
  temperature: {
    param: 'temperature',
    default: 0.75,
    min: 0,
    max: 5,
  },
  top_p: {
    param: 'p',
    default: 0.75,
    min: 0,
    max: 1,
  },
  top_k: {
    param: 'k',
    default: 0,
    max: 500,
  },
  frequency_penalty: {
    param: 'frequency_penalty',
    default: 0,
    min: 0,
    max: 1,
  },
  presence_penalty: {
    param: 'presence_penalty',
    default: 0,
    min: 0,
    max: 1,
  },
  stop: {
    param: 'end_sequences',
  },
  stream: {
    param: 'stream',
    default: false,
  },
};

interface CohereCompleteResponse {
  text: string;
  generation_id: string;
  finish_reason:
    | 'COMPLETE'
    | 'STOP_SEQUENCE'
    | 'ERROR'
    | 'ERROR_TOXIC'
    | 'ERROR_LIMIT'
    | 'USER_CANCEL'
    | 'MAX_TOKENS';
  meta: {
    api_version: {
      version: string;
    };
  };
  chat_history?: {
    role: 'CHATBOT' | 'SYSTEM' | 'TOOL' | 'USER';
    message: string;
  }[];
  message?: string;
  status?: number;
}

export const CohereChatCompleteResponseTransform: (
  response: CohereCompleteResponse,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200) {
    return generateErrorResponse(
      {
        message: response.message || '',
        type: null,
        param: null,
        code: null,
      },
      COHERE
    );
  }

  return {
    id: response.generation_id,
    object: 'chat_completion',
    created: Math.floor(Date.now() / 1000),
    model: 'Unknown',
    provider: COHERE,
    choices: [
      {
        message: { role: 'assistant', content: response.text },
        index: 0,
        finish_reason: 'length',
      },
    ],
  };
};

export type CohereStreamChunk =
  | { type: 'stream-start'; generation_id: string }
  | { type: 'text-generation'; text: string }
  | {
      type: 'stream-end';
      finish_reason: CohereCompleteResponse['finish_reason'];
    };

export const CohereChatCompleteStreamChunkTransform: (
  response: string,
  fallbackId: string
) => string = (responseChunk, fallbackId) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();
  const parsedChunk: CohereStreamChunk = JSON.parse(chunk);

  if (['stream-end'].includes(parsedChunk.type)) {
    return '';
  }

  return (
    `data: ${JSON.stringify({
      id: fallbackId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: '',
      provider: COHERE,
      choices: [
        {
          delta: {
            content: (parsedChunk as any)?.text,
          },
          index: 0,
          logprobs: null,
          finish_reason: (parsedChunk as any)?.finish_reason ?? null,
        },
      ],
    })}` + '\n\n'
  );
};
